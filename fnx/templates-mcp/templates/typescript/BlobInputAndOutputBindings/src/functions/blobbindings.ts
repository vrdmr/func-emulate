import { app, input, InvocationContext, output } from '@azure/functions';

const blobInput = input.storageBlob({
    path: 'samples-workitems/{queueTrigger}',
    connection: 'BlobStore',
});

const blobOutput = output.storageBlob({
    path: 'samples-workitems/{queueTrigger}-Copy',
    connection: 'BlobStore',
});

export async function storageQueueTrigger1(queueItem: unknown, context: InvocationContext): Promise<unknown> {
    return context.extraInputs.get(blobInput);
}

app.storageQueue('storageQueueTrigger1', {
    queueName: 'myqueue-items',
    connection: 'QueueStore',
    extraInputs: [blobInput],
    return: blobOutput,
    handler: storageQueueTrigger1,
});