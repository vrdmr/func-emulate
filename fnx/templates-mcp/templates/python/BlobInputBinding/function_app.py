import azure.functions as func
import datetime
import json
import logging
import azure.functions as func
import azurefunctions.extensions.bindings.blob as blob

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)
@app.route(route="file")
@app.blob_input(
    arg_name="client", path="PATH/TO/BLOB", connection="BlobStorageConnection"
)
def blob_input(req: func.HttpRequest, client: blob.BlobClient):
    logging.info(
        f"Python blob input function processed blob \n"
        f"Properties: {client.get_blob_properties()}\n"
        f"Blob content head: {client.download_blob().read(size=1)}"
    )
    return "ok"