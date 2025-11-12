/**
 * Type definitions for FDC operations
 * Provides comprehensive type safety across the FDC integration
 */

export interface AttestationRequest {
    url: string;
    httpMethod: string;
    headers: string;
    queryParams: string;
    body: string;
    postProcessJq: string;
    abiSignature: string;
}

export interface PreparedAttestationRequest {
    status: string;
    abiEncodedRequest: string;
}

export interface ProofData {
    response_hex: string;
    attestation_type: string;
    proof: string[];
}

export interface RoundInfo {
    roundId: number;
    blockNumber: number;
    blockTimestamp: bigint;
    explorerUrl: string;
}

export interface AttestationRequestParams {
    apiUrl: string;
    postProcessJq: string;
    abiSignature: string;
    httpMethod?: string;
    headers?: string;
    queryParams?: string;
    body?: string;
}

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryableErrors?: string[];
}

export interface PollingOptions {
    checkIntervalMs?: number;
    maxWaitTimeMs?: number;
    onProgress?: (message: string) => void;
}

export interface FDCServiceOptions {
    enableCaching?: boolean;
    cacheTtlMs?: number;
    defaultRetryOptions?: RetryOptions;
    defaultPollingOptions?: PollingOptions;
}

export enum AttestationType {
    Web2Json = "Web2Json",
    PaymentVerification = "PaymentVerification",
    BalanceDecreasing = "BalanceDecreasing",
    AddressValidity = "AddressValidity",
    BlockHeight = "BlockHeight",
}

export enum SourceId {
    PublicWeb2 = "PublicWeb2",
}

export class FDCError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = "FDCError";
    }
}

export class FDCValidationError extends FDCError {
    constructor(message: string, originalError?: Error) {
        super(message, "VALIDATION_ERROR", originalError);
        this.name = "FDCValidationError";
    }
}

export class FDCRetryError extends FDCError {
    constructor(
        message: string,
        public readonly attempts: number,
        originalError?: Error
    ) {
        super(message, "RETRY_EXHAUSTED", originalError);
        this.name = "FDCRetryError";
    }
}

export class FDCTimeoutError extends FDCError {
    constructor(message: string, public readonly timeoutMs: number) {
        super(message, "TIMEOUT");
        this.name = "FDCTimeoutError";
    }
}

