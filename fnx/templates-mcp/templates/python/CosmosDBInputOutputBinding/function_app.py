import azure.functions as func
import logging

app = func.FunctionApp()


# The following example shows an Azure Cosmos DB input binding.
# The function reads a single document and updates the document's text value.
@app.queue_trigger(
    arg_name="msg", queue_name="outqueue", connection="QueueStorageConnection"
)
@app.cosmos_db_input(
    arg_name="inputDocument",
    database_name="MyDatabase",
    collection_name="MyCollection",
    id="{msg.payload_property}",
    partition_key="{msg.payload_property}",
    connection_string_setting="MyAccount_COSMOSDB",
)
@app.cosmos_db_output(
    arg_name="outputDocument",
    database_name="MyDatabase",
    collection_name="MyCollection",
    connection_string_setting="MyAccount_COSMOSDB",
)
def test_function(
    msg: func.QueueMessage,
    inputDocument: func.DocumentList,
    outputDocument: func.Out[func.Document],
):
    # Get the first document from the input
    doc = inputDocument[0]
    doc["text"] = "This was updated!"
    outputDocument.set(doc)
    print("Updated document.")
