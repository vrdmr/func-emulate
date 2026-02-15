import azure.functions as func
import datetime
import json
import logging

app = func.FunctionApp()


@app.cosmos_db_trigger(arg_name="azcosmosdb", container_name="container_name",
                        database_name="database_name", connection="CosmosDbConnection") 
def cosmosdb_trigger(azcosmosdb: func.DocumentList):
    logging.info('Python CosmosDB triggered.')
