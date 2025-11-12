/**
 * Builder pattern for constructing attestation requests
 * Provides a fluent, type-safe API for building complex attestation requests
 */

import {
    AttestationRequestParams,
    AttestationType,
    SourceId,
} from "../types/FDCTypes";

export class AttestationRequestBuilder {
    private params: Partial<AttestationRequestParams> = {};
    private attestationType: AttestationType = AttestationType.Web2Json;
    private sourceId: SourceId = SourceId.PublicWeb2;

    /**
     * Sets the API URL to fetch data from
     */
    url(apiUrl: string): this {
        this.params.apiUrl = apiUrl;
        return this;
    }

    /**
     * Sets the JQ filter for post-processing API response
     */
    jqFilter(postProcessJq: string): this {
        this.params.postProcessJq = postProcessJq;
        return this;
    }

    /**
     * Sets the ABI signature defining the expected data structure
     */
    abiSignature(abiSignature: string): this {
        this.params.abiSignature = abiSignature;
        return this;
    }

    /**
     * Sets the HTTP method (default: GET)
     */
    method(httpMethod: string): this {
        this.params.httpMethod = httpMethod;
        return this;
    }

    /**
     * Sets HTTP headers as JSON string
     */
    headers(headers: string | Record<string, string>): this {
        this.params.headers =
            typeof headers === "string" ? headers : JSON.stringify(headers);
        return this;
    }

    /**
     * Sets query parameters as JSON string or object
     */
    queryParams(queryParams: string | Record<string, string>): this {
        this.params.queryParams =
            typeof queryParams === "string"
                ? queryParams
                : JSON.stringify(queryParams);
        return this;
    }

    /**
     * Sets request body as JSON string or object
     */
    body(body: string | Record<string, any>): this {
        this.params.body =
            typeof body === "string" ? body : JSON.stringify(body);
        return this;
    }

    /**
     * Sets the attestation type
     */
    type(attestationType: AttestationType): this {
        this.attestationType = attestationType;
        return this;
    }

    /**
     * Sets the source ID
     */
    source(sourceId: SourceId): this {
        this.sourceId = sourceId;
        return this;
    }

    /**
     * Builds the final attestation request parameters
     */
    build(): {
        params: AttestationRequestParams;
        attestationType: AttestationType;
        sourceId: SourceId;
    } {
        // Validate required fields
        if (!this.params.apiUrl) {
            throw new Error("API URL is required");
        }
        if (!this.params.postProcessJq) {
            throw new Error("JQ filter is required");
        }
        if (!this.params.abiSignature) {
            throw new Error("ABI signature is required");
        }

        return {
            params: {
                apiUrl: this.params.apiUrl,
                postProcessJq: this.params.postProcessJq,
                abiSignature: this.params.abiSignature,
                httpMethod: this.params.httpMethod || "GET",
                headers: this.params.headers || "{}",
                queryParams: this.params.queryParams || "{}",
                body: this.params.body || "{}",
            },
            attestationType: this.attestationType,
            sourceId: this.sourceId,
        };
    }

    /**
     * Resets the builder to initial state
     */
    reset(): this {
        this.params = {};
        this.attestationType = AttestationType.Web2Json;
        this.sourceId = SourceId.PublicWeb2;
        return this;
    }
}

/**
 * Convenience function to create a new builder instance
 */
export function createAttestationRequest(): AttestationRequestBuilder {
    return new AttestationRequestBuilder();
}

