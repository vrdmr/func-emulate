package com.function;

import com.microsoft.azure.functions.ExecutionContext;
import com.microsoft.azure.functions.HttpMethod;
import com.microsoft.azure.functions.HttpRequestMessage;
import com.microsoft.azure.functions.HttpResponseMessage;
import com.microsoft.azure.functions.HttpStatus;
import com.microsoft.azure.functions.annotation.AuthorizationLevel;
import com.microsoft.azure.functions.annotation.CosmosDBOutput;
import com.microsoft.azure.functions.annotation.FunctionName;
import com.microsoft.azure.functions.annotation.HttpTrigger;

import java.util.Optional;
import java.util.Random;

public class WriteOneDoc {

  @FunctionName("WriteOneDoc")
  @CosmosDBOutput(name = "database", databaseName = "ToDoList", containerName = "Items", connection = "CosmosDbConnection")
  public String run(
      @HttpTrigger(name = "req", methods = { HttpMethod.GET,
          HttpMethod.POST }, authLevel = AuthorizationLevel.ANONYMOUS) HttpRequestMessage<Optional<String>> request,
      final ExecutionContext context) {

    // Item list
    context.getLogger().info("Parameters are: " + request.getQueryParameters());

    // Parse query parameter
    String query = request.getQueryParameters().get("desc");
    String name = request.getBody().orElse(query);

    // Generate random ID
    final int id = Math.abs(new Random().nextInt());

    // Generate document
    final String jsonDocument = "{\"id\":\"" + id + "\", " +
        "\"description\": \"" + name + "\"}";

    context.getLogger().info("Document to be saved: " + jsonDocument);

    return jsonDocument;
  }
}
