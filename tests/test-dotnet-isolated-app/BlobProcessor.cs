using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace TestDotnetIsolated;

public class BlobProcessor
{
    private readonly ILogger<BlobProcessor> _logger;

    public BlobProcessor(ILogger<BlobProcessor> logger)
    {
        _logger = logger;
    }

    [Function("blobProcessor")]
    public void Run(
        [BlobTrigger("test-container/{name}", Connection = "AzureWebJobsStorage")] byte[] blob,
        string name)
    {
        _logger.LogInformation($"Blob trigger processed: {name}, Size: {blob.Length} bytes");
    }
}
