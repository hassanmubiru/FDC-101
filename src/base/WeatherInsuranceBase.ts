/**
 * Base class for weather insurance scripts
 * Provides common functionality and reduces code duplication
 */

import { FDCService } from "../services/FDCService";
import { createAttestationRequest } from "../builders/AttestationRequestBuilder";
import { AttestationType, SourceId, PollingOptions } from "../types/FDCTypes";

export interface WeatherData {
    latitude: number;
    longitude: number;
    temperature?: number;
    weatherId?: number;
    weatherMain?: string;
    description?: string;
    windSpeed?: number;
    windDeg?: number;
}

export interface PolicyParameters {
    latitude: number;
    longitude: number;
    startTimestamp: number;
    expirationTimestamp: number;
    premium: number;
    coverage: number;
}

export abstract class WeatherInsuranceBase {
    protected fdcService: FDCService;
    protected apiKey: string;

    constructor(apiKey: string) {
        this.fdcService = new FDCService({
            enableCaching: true,
            defaultPollingOptions: {
                onProgress: (message) => console.log(message),
            },
        });
        this.apiKey = apiKey;
    }

    /**
     * Builds the API URL for weather data
     */
    protected buildWeatherApiUrl(
        latitude: number,
        longitude: number,
        units: string = "metric"
    ): string {
        return `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${this.apiKey}&units=${units}`;
    }

    /**
     * Fetches weather data directly from API (for validation)
     */
    protected async fetchWeatherDataDirect(apiUrl: string): Promise<any> {
        const response = await fetch(apiUrl, { method: "GET" });
        if (!response.ok) {
            throw new Error(`Weather API returned status ${response.status}`);
        }
        return await response.json();
    }

    /**
     * Creates an attestation request for weather data
     */
    protected createWeatherAttestationRequest(
        apiUrl: string,
        jqFilter: string,
        abiSignature: string
    ) {
        return createAttestationRequest()
            .url(apiUrl)
            .jqFilter(jqFilter)
            .abiSignature(abiSignature)
            .type(AttestationType.Web2Json)
            .source(SourceId.PublicWeb2)
            .build();
    }

    /**
     * Executes the full attestation workflow for weather data
     */
    protected async executeWeatherAttestation(
        apiUrl: string,
        jqFilter: string,
        abiSignature: string,
        pollingOptions?: PollingOptions
    ) {
        const { params, attestationType, sourceId } =
            this.createWeatherAttestationRequest(apiUrl, jqFilter, abiSignature);

        return await this.fdcService.executeAttestationWorkflow(
            params,
            attestationType,
            sourceId,
            pollingOptions
        );
    }

    /**
     * Abstract method for policy-specific threshold validation
     */
    protected abstract validateThreshold(weatherData: WeatherData): boolean;

    /**
     * Abstract method for policy-specific JQ filter generation
     */
    protected abstract getJQFilter(): string;

    /**
     * Abstract method for policy-specific ABI signature
     */
    protected abstract getABISignature(): string;
}

