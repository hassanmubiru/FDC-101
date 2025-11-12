/**
 * Centralized configuration manager for FDC operations
 * Provides type-safe access to environment variables and network-specific settings
 */

import * as dotenv from "dotenv";
import hre from "hardhat";
import { getCurrentNetworkNamespace, getDALayerUrl } from "../../utils/network";

dotenv.config();

export interface NetworkConfig {
    name: string;
    chainId: number;
    rpcUrl: string;
    daLayerUrl: string;
    verifierUrl: string;
    explorerUrl: string;
    systemsExplorerUrl: string;
}

export interface FDCConfig {
    verifierApiKey: string;
    requestRetryAttempts: number;
    requestRetryDelayMs: number;
    roundFinalizationCheckIntervalMs: number;
    proofGenerationCheckIntervalMs: number;
    maxRoundFinalizationWaitMs: number;
    enableProofCache: boolean;
    proofCacheTtlMs: number;
}

/**
 * Configuration manager singleton
 * Provides centralized access to all configuration values
 */
export class ConfigManager {
    private static instance: ConfigManager;
    private networkConfig: NetworkConfig | null = null;
    private fdcConfig: FDCConfig;

    private constructor() {
        this.fdcConfig = this.loadFDCConfig();
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    /**
     * Loads FDC-specific configuration from environment variables
     */
    private loadFDCConfig(): FDCConfig {
        return {
            verifierApiKey: process.env.VERIFIER_API_KEY_TESTNET || "",
            requestRetryAttempts: parseInt(process.env.FDC_RETRY_ATTEMPTS || "10", 10),
            requestRetryDelayMs: parseInt(process.env.FDC_RETRY_DELAY_MS || "20000", 10),
            roundFinalizationCheckIntervalMs: parseInt(
                process.env.FDC_ROUND_CHECK_INTERVAL_MS || "30000",
                10
            ),
            proofGenerationCheckIntervalMs: parseInt(
                process.env.FDC_PROOF_CHECK_INTERVAL_MS || "10000",
                10
            ),
            maxRoundFinalizationWaitMs: parseInt(
                process.env.FDC_MAX_ROUND_WAIT_MS || "300000",
                10
            ),
            enableProofCache: process.env.FDC_ENABLE_PROOF_CACHE === "true",
            proofCacheTtlMs: parseInt(process.env.FDC_PROOF_CACHE_TTL_MS || "3600000", 10),
        };
    }

    /**
     * Gets network-specific configuration
     * Lazy loads to avoid initialization issues
     */
    public async getNetworkConfig(): Promise<NetworkConfig> {
        if (this.networkConfig) {
            return this.networkConfig;
        }

        const networkName = hre.network.name;
        const daLayerUrl = getDALayerUrl(networkName);

        // Determine verifier URL based on network
        const verifierUrlBase =
            networkName === "coston2"
                ? process.env.WEB2JSON_VERIFIER_URL_TESTNET || ""
                : process.env.WEB2JSON_VERIFIER_URL_MAINNET || "";

        // Build explorer URLs
        const explorerBaseUrl = this.getExplorerBaseUrl(networkName);
        const systemsExplorerBaseUrl = this.getSystemsExplorerBaseUrl(networkName);

        this.networkConfig = {
            name: networkName,
            chainId: hre.network.config.chainId || 0,
            rpcUrl: (hre.network.config as any).url || "",
            daLayerUrl,
            verifierUrl: verifierUrlBase,
            explorerUrl: explorerBaseUrl,
            systemsExplorerUrl: systemsExplorerBaseUrl,
        };

        return this.networkConfig;
    }

    /**
     * Gets FDC configuration
     */
    public getFDCConfig(): FDCConfig {
        return { ...this.fdcConfig };
    }

    /**
     * Updates FDC configuration (useful for testing)
     */
    public updateFDCConfig(updates: Partial<FDCConfig>): void {
        this.fdcConfig = { ...this.fdcConfig, ...updates };
    }

    private getExplorerBaseUrl(networkName: string): string {
        const explorerUrls: Record<string, string> = {
            coston: "https://coston-explorer.flare.network",
            coston2: "https://coston2-explorer.flare.network",
            songbird: "https://songbird-explorer.flare.network",
            flare: "https://flare-explorer.flare.network",
        };
        return explorerUrls[networkName] || "";
    }

    private getSystemsExplorerBaseUrl(networkName: string): string {
        return `https://${networkName}-systems-explorer.flare.rocks`;
    }

    /**
     * Validates that all required configuration is present
     */
    public validateConfig(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const fdcConfig = this.getFDCConfig();

        if (!fdcConfig.verifierApiKey) {
            errors.push("VERIFIER_API_KEY_TESTNET is required");
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}

