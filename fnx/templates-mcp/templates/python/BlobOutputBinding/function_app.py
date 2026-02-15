import azure.functions as func
import logging

app = func.FunctionApp()


@app.function_name(name="BlobOutput1")
@app.route(route="file")
@app.blob_input(
    arg_name="inputblob",
    path="sample-workitems/test.txt",
    connection="BlobStorageConnection"
)
@app.blob_output(
    arg_name="outputblob",
    path="newblob/test.txt",
    connection="BlobStorageConnection"
)
def main(req: func.HttpRequest, inputblob: str, outputblob: func.Out[str]):
    logging.info(
        f"Python Queue trigger function processed {len(inputblob)} bytes"
    )
    outputblob.set(inputblob)
    return "ok"
