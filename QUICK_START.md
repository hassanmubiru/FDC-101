# Quick Start Guide - Enhanced FDC-101

## Using the Refactored Code

### Basic Usage (New Service Layer)

```typescript
import { FDCService } from "./src/services/FDCService";
import { createAttestationRequest } from "./src/builders/AttestationRequestBuilder";
import { AttestationType, SourceId } from "./src/types/FDCTypes";

// Initialize service
const fdcService = new FDCService({
    enableCaching: true,
    defaultPollingOptions: {
        onProgress: (msg) => console.log(msg),
    },
});

// Build request using builder pattern
const { params, attestationType, sourceId } = createAttestationRequest()
    .url("https://api.example.com/data")
    .jqFilter("{value: .value}")
    .abiSignature('{"components": [...], "type": "tuple"}')
    .build();

// Execute complete workflow
const { roundInfo, proof } = await fdcService.executeAttestationWorkflow(
    params,
    attestationType,
    sourceId
);
```

### Running the Refactored Example

```bash
# Run the enhanced Web2Json example
yarn hardhat run scripts/fdcExample/Web2Json.refactored.ts --network coston2
```

### Using Original Code (Backward Compatible)

```bash
# Original scripts still work
yarn hardhat run scripts/fdcExample/Web2Json.ts --network coston2
```

## Key Features

### 1. Unified Service Layer
- Single entry point for all FDC operations
- Automatic retry with exponential backoff
- Built-in proof caching

### 2. Builder Pattern
- Fluent API for request construction
- Compile-time validation
- Reduced boilerplate

### 3. Enhanced Error Handling
```typescript
try {
    const { proof } = await fdcService.executeAttestationWorkflow(params);
} catch (error) {
    if (error instanceof FDCRetryError) {
        console.error(`Failed after ${error.attempts} attempts`);
    } else if (error instanceof FDCTimeoutError) {
        console.error(`Timeout after ${error.timeoutMs}ms`);
    }
}
```

### 4. Configuration Management
```typescript
import { ConfigManager } from "./src/config/ConfigManager";

const config = ConfigManager.getInstance();
const networkConfig = await config.getNetworkConfig();
const fdcConfig = config.getFDCConfig();
```

## Environment Variables

Add to your `.env` file:

```bash
# Required
PRIVATE_KEY=your_private_key
VERIFIER_API_KEY_TESTNET=your_api_key

# Optional (with defaults)
FDC_ENABLE_PROOF_CACHE=true
FDC_PROOF_CACHE_TTL_MS=3600000
FDC_RETRY_ATTEMPTS=10
LOG_LEVEL=INFO
```

## Migration Guide

### Step 1: Update Imports
```typescript
// Old
import { prepareAttestationRequestBase } from "../utils/fdc";

// New
import { FDCService } from "../src/services/FDCService";
```

### Step 2: Use Service Layer
```typescript
// Old
const data = await prepareAttestationRequestBase(...);
const roundId = await submitAttestationRequest(...);
const proof = await retrieveDataAndProofBaseWithRetry(...);

// New
const fdcService = new FDCService();
const { roundInfo, proof } = await fdcService.executeAttestationWorkflow(params);
```

### Step 3: Use Builder Pattern
```typescript
// Old
const requestBody = {
    url: apiUrl,
    httpMethod: "GET",
    // ...
};

// New
const { params } = createAttestationRequest()
    .url(apiUrl)
    .method("GET")
    .build();
```

## Performance Tips

1. **Enable Caching**: Set `enableCaching: true` for repeated requests
2. **Adjust Polling**: Configure intervals based on network latency
3. **Retry Strategy**: Customize retry options for your use case

## Documentation

- **[README.md](./README.md)** - Main project documentation
- **[README.REFACTORED.md](./README.REFACTORED.md)** - Detailed enhancements
- **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)** - Executive summary
- **[VALIDATION_REPORT.md](./VALIDATION_REPORT.md)** - Validation results

## Support

For issues or questions:
1. Check the documentation files
2. Review the example scripts
3. Examine the type definitions in `src/types/FDCTypes.ts`

