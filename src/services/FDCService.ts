/**
 * Unified FDC Service Layer
 * Provides a high-level, type-safe interface for FDC operations
 * with built-in retry logic, caching, and error handling
 */

import { ethers, artifacts } from "hardhat";
import { ConfigManager } from "../config/ConfigManager";
import {
    AttestationRequest,
    AttestationRequestParams,
    PreparedAttestationRequest,
    ProofData,
    RoundInfo,
    RetryOptions,
    PollingOptions,
    FDCServiceOptions,
    AttestationType,
    SourceId,
    FDCError,
    FDCRetryError,
    FDCTimeoutError,
} from "../types/FDCTypes";
import { toUtf8HexString, sleep } from "../../scripts/utils/core";
import {
    getFdcHub,
    getRelay,
    getFdcVerification,
    getFlareSystemsManager,
} from "../../scripts/utils/getters";
import {
    IFlareSystemsManagerInstance,
    IRelayInstance,
    IFdcVerificationInstance,
} from "../../typechain-types";

/**
 * Simple in-memory cache for proofs
 */
class ProofCache {
    private cache: Map<string, { data: ProofData; timestamp: number }> = new Map();
    private ttl: number;

    constructor(ttlMs: number) {
        this.ttl = ttlMs;
    }

    get(key: string): ProofData | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        const age = Date.now() - entry.timestamp;
        if (age > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    set(key: string, data: ProofData): void {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    clear(): void {
        this.cache.clear();
    }

    generateKey(abiEncodedRequest: string, roundId: number): string {
        return `${abiEncodedRequest}:${roundId}`;
    }
}

/**
 * Exponential backoff retry strategy
 */
class RetryStrategy {
    private maxAttempts: number;
    private initialDelayMs: number;
    private maxDelayMs: number;
    private backoffMultiplier: number;

    constructor(options: RetryOptions = {}) {
        this.maxAttempts = options.maxAttempts || 10;
        this.initialDelayMs = options.initialDelayMs || 1000;
        this.maxDelayMs = options.maxDelayMs || 60000;
        this.backoffMultiplier = options.backoffMultiplier || 2;
    }

    async execute<T>(
        operation: () => Promise<T>,
        onRetry?: (attempt: number, error: Error) => void
    ): Promise<T> {
        let lastError: Error | null = null;
        let delay = this.initialDelayMs;

        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt === this.maxAttempts) {
                    break;
                }

                if (onRetry) {
                    onRetry(attempt, lastError);
                }

                await sleep(delay);
                delay = Math.min(delay * this.backoffMultiplier, this.maxDelayMs);
            }
        }

        throw new FDCRetryError(
            `Operation failed after ${this.maxAttempts} attempts`,
            this.maxAttempts,
            lastError || undefined
        );
    }
}

/**
 * Main FDC Service class
 */
export class FDCService {
    private configManager: ConfigManager;
    private proofCache: ProofCache | null = null;
    private defaultRetryOptions: RetryOptions;
    private defaultPollingOptions: PollingOptions;

    constructor(options: FDCServiceOptions = {}) {
        this.configManager = ConfigManager.getInstance();
        const fdcConfig = this.configManager.getFDCConfig();

        if (options.enableCaching ?? fdcConfig.enableProofCache) {
            const ttl = options.cacheTtlMs || fdcConfig.proofCacheTtlMs;
            this.proofCache = new ProofCache(ttl);
        }

        this.defaultRetryOptions = options.defaultRetryOptions || {
            maxAttempts: fdcConfig.requestRetryAttempts,
            initialDelayMs: 1000,
            maxDelayMs: 60000,
            backoffMultiplier: 2,
        };

        this.defaultPollingOptions = options.defaultPollingOptions || {
            checkIntervalMs: fdcConfig.roundFinalizationCheckIntervalMs,
            maxWaitTimeMs: fdcConfig.maxRoundFinalizationWaitMs,
        };
    }

    /**
     * Prepares an attestation request by encoding it via the verifier server
     */
    async prepareAttestationRequest(
        params: AttestationRequestParams,
        attestationType: AttestationType = AttestationType.Web2Json,
        sourceId: SourceId = SourceId.PublicWeb2
    ): Promise<PreparedAttestationRequest> {
        const networkConfig = await this.configManager.getNetworkConfig();
        const fdcConfig = this.configManager.getFDCConfig();

        const requestBody: AttestationRequest = {
            url: params.apiUrl,
            httpMethod: params.httpMethod || "GET",
            headers: params.headers || "{}",
            queryParams: params.queryParams || "{}",
            body: params.body || "{}",
            postProcessJq: params.postProcessJq,
            abiSignature: params.abiSignature,
        };

        const url = `${networkConfig.verifierUrl}${attestationType}/prepareRequest`;
        const attestationTypeHex = toUtf8HexString(attestationType);
        const sourceIdHex = toUtf8HexString(sourceId);

        const request = {
            attestationType: attestationTypeHex,
            sourceId: sourceIdHex,
            requestBody,
        };

        const retryStrategy = new RetryStrategy(this.defaultRetryOptions);

        return await retryStrategy.execute(async () => {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "X-API-KEY": fdcConfig.verifierApiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                throw new FDCError(
                    `Verifier server returned status ${response.status}: ${response.statusText}`,
                    "VERIFIER_ERROR"
                );
            }

            const data = await response.json();

            if (data.status !== "VALID") {
                throw new FDCError(
                    `Invalid attestation request: ${data.status}`,
                    "INVALID_REQUEST"
                );
            }

            return data as PreparedAttestationRequest;
        });
    }

    /**
     * Submits an attestation request to the FDC Hub
     */
    async submitAttestationRequest(abiEncodedRequest: string): Promise<RoundInfo> {
        const fdcHub = await getFdcHub();
        const networkConfig = await this.configManager.getNetworkConfig();

        // Calculate request fee
        const { getContractAddressByName } = await import("../../scripts/utils/getters");
        const IFdcRequestFeeConfigurations = artifacts.require("IFdcRequestFeeConfigurations");
        const fdcRequestFeeConfigurationsAddress = await getContractAddressByName(
            "FdcRequestFeeConfigurations"
        );
        const fdcRequestFeeConfigurations = await IFdcRequestFeeConfigurations.at(
            fdcRequestFeeConfigurationsAddress
        );
        const requestFee = await fdcRequestFeeConfigurations.getRequestFee(abiEncodedRequest);

        // Submit request
        const transaction = await fdcHub.requestAttestation(abiEncodedRequest, {
            value: requestFee,
        });

        // Calculate round ID
        const blockNumber = transaction.receipt.blockNumber;
        const block = await ethers.provider.getBlock(blockNumber);
        const blockTimestamp = BigInt(block.timestamp);

        const flareSystemsManager: IFlareSystemsManagerInstance =
            await getFlareSystemsManager();
        const firstVotingRoundStartTs = BigInt(
            await flareSystemsManager.firstVotingRoundStartTs()
        );
        const votingEpochDurationSeconds = BigInt(
            await flareSystemsManager.votingEpochDurationSeconds()
        );

        const roundId = Number(
            (blockTimestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds
        );

        const explorerUrl = `${networkConfig.systemsExplorerUrl}/voting-round/${roundId}?tab=fdc`;

        return {
            roundId,
            blockNumber,
            blockTimestamp,
            explorerUrl,
        };
    }

    /**
     * Waits for a voting round to finalize with adaptive polling
     */
    async waitForRoundFinalization(
        roundId: number,
        options: PollingOptions = {}
    ): Promise<void> {
        const pollingOptions = { ...this.defaultPollingOptions, ...options };
        const relay: IRelayInstance = await getRelay();
        const fdcVerification: IFdcVerificationInstance = await getFdcVerification();
        const protocolId = await fdcVerification.fdcProtocolId();

        const startTime = Date.now();
        let checkInterval = pollingOptions.checkIntervalMs || 30000;
        let consecutiveChecks = 0;

        while (true) {
            const isFinalized = await relay.isFinalized(protocolId, roundId);

            if (isFinalized) {
                if (pollingOptions.onProgress) {
                    pollingOptions.onProgress(`Round ${roundId} finalized`);
                }
                return;
            }

            const elapsed = Date.now() - startTime;
            if (pollingOptions.maxWaitTimeMs && elapsed > pollingOptions.maxWaitTimeMs) {
                throw new FDCTimeoutError(
                    `Round ${roundId} did not finalize within ${pollingOptions.maxWaitTimeMs}ms`,
                    pollingOptions.maxWaitTimeMs
                );
            }

            consecutiveChecks++;
            // Adaptive polling: increase interval after multiple checks
            if (consecutiveChecks > 5 && checkInterval < 60000) {
                checkInterval = Math.min(checkInterval * 1.5, 60000);
            }

            if (pollingOptions.onProgress) {
                pollingOptions.onProgress(
                    `Waiting for round ${roundId} to finalize... (${Math.round(elapsed / 1000)}s elapsed)`
                );
            }

            await sleep(checkInterval);
        }
    }

    /**
     * Retrieves proof data from the DA Layer
     */
    async retrieveProof(
        abiEncodedRequest: string,
        roundId: number,
        options: PollingOptions = {}
    ): Promise<ProofData> {
        // Check cache first
        if (this.proofCache) {
            const cacheKey = this.proofCache.generateKey(abiEncodedRequest, roundId);
            const cached = this.proofCache.get(cacheKey);
            if (cached) {
                return cached;
            }
        }

        const networkConfig = await this.configManager.getNetworkConfig();
        const fdcConfig = this.configManager.getFDCConfig();
        const pollingOptions = { ...this.defaultPollingOptions, ...options };

        const url = `${networkConfig.daLayerUrl}api/v1/fdc/proof-by-request-round-raw`;
        const request = {
            votingRoundId: roundId,
            requestBytes: abiEncodedRequest,
        };

        // Wait for round finalization first
        await this.waitForRoundFinalization(roundId, pollingOptions);

        // Small delay to ensure proof is available
        await sleep(10000);

        // Poll for proof generation
        const startTime = Date.now();
        let proof: ProofData | null = null;

        while (true) {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.response_hex) {
                    proof = data as ProofData;
                    break;
                }
            }

            const elapsed = Date.now() - startTime;
            if (pollingOptions.maxWaitTimeMs && elapsed > pollingOptions.maxWaitTimeMs) {
                throw new FDCTimeoutError(
                    `Proof generation timed out after ${pollingOptions.maxWaitTimeMs}ms`,
                    pollingOptions.maxWaitTimeMs
                );
            }

            if (pollingOptions.onProgress) {
                pollingOptions.onProgress(
                    `Waiting for proof generation... (${Math.round(elapsed / 1000)}s elapsed)`
                );
            }

            await sleep(pollingOptions.checkIntervalMs || fdcConfig.proofGenerationCheckIntervalMs);
        }

        if (!proof) {
            throw new FDCError("Failed to retrieve proof", "PROOF_RETRIEVAL_FAILED");
        }

        // Cache the proof
        if (this.proofCache) {
            const cacheKey = this.proofCache.generateKey(abiEncodedRequest, roundId);
            this.proofCache.set(cacheKey, proof);
        }

        return proof;
    }

    /**
     * Complete workflow: prepare, submit, wait, and retrieve proof
     */
    async executeAttestationWorkflow(
        params: AttestationRequestParams,
        attestationType: AttestationType = AttestationType.Web2Json,
        sourceId: SourceId = SourceId.PublicWeb2,
        pollingOptions?: PollingOptions
    ): Promise<{ roundInfo: RoundInfo; proof: ProofData }> {
        // Prepare request
        const prepared = await this.prepareAttestationRequest(params, attestationType, sourceId);

        // Submit request
        const roundInfo = await this.submitAttestationRequest(prepared.abiEncodedRequest);

        // Retrieve proof
        const proof = await this.retrieveProof(
            prepared.abiEncodedRequest,
            roundInfo.roundId,
            pollingOptions
        );

        return { roundInfo, proof };
    }

    /**
     * Clears the proof cache
     */
    clearCache(): void {
        if (this.proofCache) {
            this.proofCache.clear();
        }
    }
}

