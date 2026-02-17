const { app } = require('@azure/functions');

app.storageBlob('blobProcessor', {
    path: 'test-container/{name}',
    connection: 'AzureWebJobsStorage',
    handler: async (blob, context) => {
        context.log(`Blob trigger processed: ${context.triggerMetadata.name}, Size: ${blob.length} bytes`);
    }
});
