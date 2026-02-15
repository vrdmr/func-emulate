using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace CosmosDBInputBinding;

public class CosmosDBInputBinding
{
    private readonly ILogger<CosmosDBInputBinding> _logger;

    public CosmosDBInputBinding(ILogger<CosmosDBInputBinding> logger)
    {
        _logger = logger;
    }

    [Function(nameof(DocByIdFromJSON))]
    public void DocByIdFromJSON(
    [QueueTrigger("todoqueueforlookup")] ToDoItemLookup toDoItemLookup,
    [CosmosDBInput(
        databaseName: "ToDoItems",
        containerName: "Items",
        Connection  = "CosmosDBConnection",
        Id = "{ToDoItemId}",
        PartitionKey = "{ToDoItemPartitionKeyValue}")] ToDoItem toDoItem)
    {
        _logger.LogInformation($"C# Queue trigger function processed Id={toDoItemLookup?.ToDoItemId} Key={toDoItemLookup?.ToDoItemPartitionKeyValue}");

        if (toDoItem == null)
        {
            _logger.LogInformation($"ToDo item not found");
        }
        else
        {
            _logger.LogInformation($"Found ToDo item, Description={toDoItem.Description}");
        }
    }
}