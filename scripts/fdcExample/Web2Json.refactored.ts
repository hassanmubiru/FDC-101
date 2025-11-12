/**
 * Refactored Web2Json Example
 * Demonstrates the improved FDC service layer with better error handling,
 * type safety, and cleaner code structure
 */

import { run, web3 } from "hardhat";
import { StarWarsCharacterListV2Instance } from "../../typechain-types";
import { FDCService } from "../../src/services/FDCService";
import { createAttestationRequest } from "../../src/builders/AttestationRequestBuilder";
import { AttestationType, SourceId } from "../../src/types/FDCTypes";

const StarWarsCharacterListV2 = artifacts.require("StarWarsCharacterListV2");

/**
 * Deploys and verifies the StarWarsCharacterListV2 contract
 */
async function deployAndVerifyContract(): Promise<StarWarsCharacterListV2Instance> {
    const args: any[] = [];
    const characterList: StarWarsCharacterListV2Instance =
        await StarWarsCharacterListV2.new(...args);

    try {
        await run("verify:verify", {
            address: characterList.address,
            constructorArguments: args,
        });
    } catch (e: any) {
        console.log("Verification error (non-critical):", e.message);
    }

    console.log("StarWarsCharacterListV2 deployed to", characterList.address, "\n");
    return characterList;
}

/**
 * Interacts with the contract using the proof data
 */
async function interactWithContract(
    characterList: StarWarsCharacterListV2Instance,
    proof: any
): Promise<void> {
    console.log("Processing proof data...\n");

    // Decode the proof response
    const IWeb2JsonVerification = await artifacts.require("IWeb2JsonVerification");
    const responseType = IWeb2JsonVerification._json.abi[0].inputs[0].components[1];

    const decodedResponse = web3.eth.abi.decodeParameter(responseType, proof.response_hex);
    console.log("Decoded response:", decodedResponse, "\n");

    // Submit to contract
    const transaction = await characterList.addCharacter({
        merkleProof: proof.proof,
        data: decodedResponse,
    });

    console.log("Transaction hash:", transaction.tx, "\n");

    // Display results
    const characters = await characterList.getAllCharacters();
    console.log("Star Wars Characters:\n", characters, "\n");
}

/**
 * Main execution function
 */
async function main() {
    try {
        // Initialize FDC service
        const fdcService = new FDCService({
            enableCaching: true,
            defaultPollingOptions: {
                onProgress: (message) => console.log(message),
            },
        });

        // Build attestation request using builder pattern
        const { params, attestationType, sourceId } = createAttestationRequest()
            .url("https://swapi.info/api/people/3")
            .jqFilter(
                `{name: .name, height: .height, mass: .mass, numberOfFilms: .films | length, uid: (.url | split("/") | .[-1] | tonumber)}`
            )
            .abiSignature(
                `{"components": [{"internalType": "string", "name": "name", "type": "string"},{"internalType": "uint256", "name": "height", "type": "uint256"},{"internalType": "uint256", "name": "mass", "type": "uint256"},{"internalType": "uint256", "name": "numberOfFilms", "type": "uint256"},{"internalType": "uint256", "name": "uid", "type": "uint256"}],"name": "task","type": "tuple"}`
            )
            .type(AttestationType.Web2Json)
            .source(SourceId.PublicWeb2)
            .build();

        console.log("Preparing attestation request...\n");
        const { roundInfo, proof } = await fdcService.executeAttestationWorkflow(
            params,
            attestationType,
            sourceId,
            {
                onProgress: (message) => console.log(message),
            }
        );

        console.log(`Round ${roundInfo.roundId} completed`);
        console.log(`Explorer: ${roundInfo.explorerUrl}\n`);

        // Deploy contract
        console.log("Deploying contract...\n");
        const characterList = await deployAndVerifyContract();

        // Interact with contract
        console.log("Submitting data to contract...\n");
        await interactWithContract(characterList, proof);

        console.log("✅ Workflow completed successfully!");
    } catch (error: any) {
        console.error("❌ Error:", error.message);
        if (error.stack) {
            console.error("Stack trace:", error.stack);
        }
        process.exit(1);
    }
}

void main().then(() => {
    process.exit(0);
});

