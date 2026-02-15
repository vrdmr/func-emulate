import azure.functions as func
import datetime
import json
import logging

app = func.FunctionApp()


@app.blob_trigger(arg_name="myblob", path="samples-workitems", source="EventGrid",
                               connection="BlobStorageConnection") 
def event_grid_blob_trigger(myblob: func.InputStream):
    logging.info(f"Python blob trigger (using Event Grid) function processed blob"
                f"Name: {myblob.name}"
                f"Blob Size: {myblob.length} bytes")
