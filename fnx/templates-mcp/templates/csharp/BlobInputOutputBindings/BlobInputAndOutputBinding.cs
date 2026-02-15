// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace BlobInputAndOutputBinding
{
    public static class BlobFunction
    {
        [Function(nameof(BlobFunction))]
        [BlobOutput("test-samples-output/{name}-output.txt", Connection = "BlobStoreConnection")]
        public static async string Run(
            [BlobTrigger("test-samples-trigger/{name}", Connection = "BlobStoreConnection")] string myTriggerItem,
            [BlobInput("test-samples-input/sample1.txt", Connection = "BlobStoreConnection")] string myBlob,
            FunctionContext context)
        {
            var logger = context.GetLogger("BlobFunction");
            logger.LogInformation("Triggered Item = {myTriggerItem}", myTriggerItem);
            logger.LogInformation("Input Item = {myBlob}", myBlob);

            // Blob Output
            return "blob-output content";
        }
    }
}