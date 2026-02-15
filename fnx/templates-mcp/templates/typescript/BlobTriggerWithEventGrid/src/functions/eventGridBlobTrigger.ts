import { app, InvocationContext } from "@azure/functions";

export async function eventGridBlobTrigger(blob: Buffer, context: InvocationContext): Promise<void> {
    context.log(`Storage blob function processed blob "${context.triggerMetadata.name}" with size ${blob.length} bytes`);
}

app.storageBlob('eventGridBlobTrigger', {
    path: 'samples-workitems/{name}',
    source: 'EventGrid',
    connection: 'BlobStore',
    handler: eventGridBlobTrigger
});
