import { app, InvocationContext } from "@azure/functions";

export async function cosmosDBTrigger(documents: unknown[], context: InvocationContext): Promise<void> {
    context.log(`Cosmos DB function processed ${documents.length} documents`);
}

app.cosmosDB('cosmosDBTrigger', {
    connectionStringSetting: 'CosmosDbConnection',
    databaseName: 'database_name',
    collectionName: 'container_name',
    createLeaseCollectionIfNotExists: true,
    handler: cosmosDBTrigger
});
