Lets look at a new way to think about Core Tools and Azure Functions.

What is in my mind - The problem only
- `func` is mainly an emulator in my mind.
- it runs host (https://github.com/Azure/azure-functions-host)
- But Azure Functions has many SKUs - more info in `# Azure Functions Scale and Hosting` below
- The deployment of new functions host happens in different cadence across Functions SKUs. e.g.
  - 4.1047.100 might go in Flex
  - 4.1044.400 might be in Windows Consumption

Components -
- Host - This is the runtime of azure functions
- Extension Bundles - This is a bunch of extensions that host uses to enable non-http triggers.
- Core Tools - It is Azure Functions Template generator, Emulator, Deployment features (look at `func -h` for details)


Relase cycle on SKUs
- Flex - flex would have every 2 weeks release cycle
- other SKUs might be released every three months (3 months)
- Extension bundles would be available with Flex release cycle (Extension Bundles is released as a CDN update and core tools can pull it from CDN)
- The Core tools should go out with Flex release cycle.


The main blocker is for local development.
- Functions Core tools contains host that it uses as an emulator.
- they also depend on extension bundles - which is linked to host version.
- The challenge - 
  - customer might use a feature that got released with Extension Bundles
  - but release in a different SKU where that host version + Extension Bundles would not be present - it might break.

  You can run the `func -h` for some more details.

  - https://github.com/Azure/azure-functions-core-tools


How to Develop Azure Functions locally using Core Tools
---
layout: Conceptual
title: Develop Azure Functions locally using Core Tools | Microsoft Learn
canonicalUrl: https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local
breadcrumb_path: /azure/bread/toc.json
feedback_help_link_url: https://learn.microsoft.com/answers/tags/87/azure-functions/
feedback_help_link_type: get-help-at-qna
feedback_product_url: https://feedback.azure.com/d365community/forum/9df02822-f224-ec11-b6e6-000d3a4f0da0
feedback_system: Standard
permissioned-type: public
recommendations: true
recommendation_types:
- Training
- Certification
uhfHeaderId: azure
ms.suite: office
adobe-target: true
zone_pivot_group_filename: zone-pivot-groups.json
author: ggailey777
learn_banner_products:
- azure-functions
manager: susanpotter
ms.author: glenga
ms.service: azure-functions
description: Learn how to code and test Azure Functions from the command prompt or terminal on your local computer before you deploy them to run them on Azure Functions.
ms.assetid: 242736be-ec66-4114-924b-31795fd18884
ms.topic: conceptual
ms.date: 2025-02-23T00:00:00.0000000Z
zone_pivot_groups: programming-languages-set-functions
ms.custom:
- devx-track-csharp
- 80e4ff38-5174-43
- devx-track-extended-java
- devx-track-js
- devx-track-python
- devx-track-ts
- sfi-ropc-nochange
locale: en-us
document_id: b2646ad4-34b7-fc5e-dcc9-d53a061df394
document_version_independent_id: bbff4fda-24e4-2b62-24b9-94cda5f53bed
updated_at: 2025-10-23T11:11:00.0000000Z
original_content_git_url: https://github.com/MicrosoftDocs/azure-docs-pr/blob/live/articles/azure-functions/functions-run-local.md
gitcommit: https://github.com/MicrosoftDocs/azure-docs-pr/blob/6c9b69fbda8259506e9b72ae3c6cb9c13c230e1e/articles/azure-functions/functions-run-local.md
git_commit_id: 6c9b69fbda8259506e9b72ae3c6cb9c13c230e1e
site_name: Docs
depot_name: Azure.azure-documents
page_type: conceptual
toc_rel: toc.json
pdf_url_template: https://learn.microsoft.com/pdfstore/en-us/Azure.azure-documents/{branchName}{pdfName}
word_count: 5215
asset_id: azure-functions/functions-run-local
moniker_range_name: 
monikers: []
item_type: Content
source_path: articles/azure-functions/functions-run-local.md
cmProducts:
- https://authoring-docs-microsoft.poolparty.biz/devrel/540ac133-a371-4dbb-8f94-28d6cc77a70b
spProducts:
- https://authoring-docs-microsoft.poolparty.biz/devrel/60bfc045-f127-4841-9d00-ea35495a5800
platformId: eb3f063e-2e12-b19d-7167-5c6eb1187cc4
---

# Develop Azure Functions locally using Core Tools | Microsoft Learn

Azure Functions Core Tools lets you develop and test your functions on your local computer. When you're ready, you can also use Core Tools to deploy your code project to Azure and work with application settings.

> 
> You're viewing the C# version of this article. Make sure to select your preferred Functions programming language at the top of the article.

If you want to get started right away, complete the [Core Tools quickstart article](how-to-create-function-azure-cli?pivots=programming-language-csharp).

> 
> You're viewing the Java version of this article. Make sure to select your preferred Functions programming language at the top of the article.

If you want to get started right away, complete the [Core Tools quickstart article](how-to-create-function-azure-cli?pivots=programming-language-java).

> 
> You're viewing the JavaScript version of this article. Make sure to select your preferred Functions programming language at the top of the article.

If you want to get started right away, complete the [Core Tools quickstart article](how-to-create-function-azure-cli?pivots=programming-language-javascript).

> 
> You're viewing the PowerShell version of this article. Make sure to select your preferred Functions programming language at the top of the article.

If you want to get started right away, complete the [Core Tools quickstart article](how-to-create-function-azure-cli?pivots=programming-language-powershell).

> 
> You're viewing the Python version of this article. Make sure to select your preferred Functions programming language at the top of the article.

If you want to get started right away, complete the [Core Tools quickstart article](how-to-create-function-azure-cli?pivots=programming-language-python).

> 
> You're viewing the TypeScript version of this article. Make sure to select your preferred Functions programming language at the top of the article.

If you want to get started right away, complete the [Core Tools quickstart article](how-to-create-function-azure-cli?pivots=programming-language-typescript).

## Install the Azure Functions Core Tools

The recommended way to install Core Tools depends on the operating system of your local development computer.

**Windows**
The following steps use a Windows installer (MSI) to install Core Tools v4.x. For more information about other package-based installers, see the [Core Tools readme](https://github.com/Azure/azure-functions-core-tools/blob/v4.x/README.md#windows).

Download and run the Core Tools installer, based on your version of Windows:

- [v4.x - Windows 64-bit](https://go.microsoft.com/fwlink/?linkid=2174087) (Recommended. [Visual Studio Code debugging](functions-develop-vs-code#debugging-functions-locally) requires 64-bit.)
- [v4.x - Windows 32-bit](https://go.microsoft.com/fwlink/?linkid=2174159)

If you previously used Windows installer (MSI) to install Core Tools on Windows, you should uninstall the old version from Add Remove Programs before installing the latest version.

Tip

To install Core Tools on [Windows Subsystem for Linux (WSL)](/en-us/windows/wsl/install), follow the instructions on the Linux tab.

**macOS**
The following steps use Homebrew to install the Core Tools on macOS.

1. Install [Homebrew](https://brew.sh/), if it's not already installed.
2. Install the Core Tools package:

    ```bash
    brew tap azure/functions
    brew install azure-functions-core-tools@4
    # if upgrading on a machine that has 2.x or 3.x installed:
    brew link --overwrite azure-functions-core-tools@4
    ```

**Linux**
The following steps use [APT](https://wiki.debian.org/Apt) to install Core Tools on your Ubuntu/Debian Linux distribution. For other Linux distributions, see the [Core Tools readme](https://github.com/Azure/azure-functions-core-tools/blob/v4.x/README.md#linux).

1. Install the Microsoft package repository GPG key, to validate package integrity:

    ```bash
    curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg
    sudo mv microsoft.gpg /etc/apt/trusted.gpg.d/microsoft.gpg
    ```
2. Set up the APT source list before doing an APT update.

##### Ubuntu

    ```bash
    sudo sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/microsoft-ubuntu-$(lsb_release -cs 2>/dev/null)-prod $(lsb_release -cs 2>/dev/null) main" > /etc/apt/sources.list.d/dotnetdev.list'
    ```

##### Debian

    ```bash
    sudo sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/debian/$(lsb_release -rs 2>/dev/null | cut -d'.' -f 1)/prod $(lsb_release -cs 2>/dev/null) main" > /etc/apt/sources.list.d/dotnetdev.list'
    ```
3. Check the `/etc/apt/sources.list.d/dotnetdev.list` file for one of the appropriate Linux version strings in the following table:

    | Linux distribution | Version |
    | --- | --- |
    | Debian 12 | `bookworm` |
    | Debian 11 | `bullseye` |
    | Debian 10 | `buster` |
    | Debian 9 | `stretch` |
    | Ubuntu 24.04 | `noble` |
    | Ubuntu 22.04 | `jammy` |
    | Ubuntu 20.04 | `focal` |
    | Ubuntu 19.04 | `disco` |
    | Ubuntu 18.10 | `cosmic` |
    | Ubuntu 18.04 | `bionic` |
    | Ubuntu 17.04 | `zesty` |
    | Ubuntu 16.04/Linux Mint 18 | `xenial` |
4. Start the APT source update:

    ```bash
    sudo apt-get update
    ```
5. Install the Core Tools package:

    ```bash
    sudo apt-get install azure-functions-core-tools-4
    ```

For help with version-related issues, see Core Tools versions.

## Create your local project

Important

For Python, you must run Core Tools commands in a virtual environment. For more information, see [Quickstart: Create a Python function in Azure from the command line](how-to-create-function-azure-cli?pivots=programming-language-python#create-venv).

In the terminal window or from a command prompt, run the following command to create a project in the `MyProjFolder` folder:

**Isolated worker model**

```console
func init MyProjFolder --worker-runtime dotnet-isolated 
```

By default this command creates a project that runs in-process with the Functions host on the current [Long-Term Support (LTS) version of .NET Core](https://dotnet.microsoft.com/platform/support/policy/dotnet-core#lifecycle). You can use the `--target-framework` option to target a specific supported version of .NET, including .NET Framework. For more information, see the [`func init`](functions-core-tools-reference#func-init) reference.

**In-process model**

```console
func init MyProjFolder --worker-runtime dotnet 
```

This command creates a project that runs on the current [Long-Term Support (LTS) version of .NET Core](https://dotnet.microsoft.com/platform/support/policy/dotnet-core#lifecycle). For other .NET version, create an app that runs in an isolated worker process from the Functions host.

For a comparison between the two .NET process models, see the [process mode comparison article](dotnet-isolated-in-process-differences).

Java uses a Maven archetype to create the local project, along with your first HTTP triggered function. Rather than using `func init` and `func new`, you should instead follow the steps in the [Command line quickstart](how-to-create-function-azure-cli?pivots=programming-language-java).

**v4**

```console
func init MyProjFolder --worker-runtime javascript --model V4
```

**v3**

```console
func init MyProjFolder --worker-runtime javascript --model V3
```

This command creates a JavaScript project that uses the desired [programming model version](functions-reference-node).

**v4**

```console
func init MyProjFolder --worker-runtime typescript --model V4
```

**v3**

```console
func init MyProjFolder --worker-runtime typescript --model V3
```

This command creates a TypeScript project that uses the desired [programming model version](functions-reference-node).

```console
func init MyProjFolder --worker-runtime powershell
```

**v2**

```console
func init MyProjFolder --worker-runtime python --model V2
```

**v1**

```console
func init MyProjFolder --worker-runtime python
```

This command creates a Python project that uses the desired [programming model version](functions-reference-python#programming-model).

When you run `func init` without the `--worker-runtime` option, you're prompted to choose your project language. To learn more about the available options for the `func init` command, see the [`func init`](functions-core-tools-reference#func-init) reference.

## Create a function

To add a function to your project, run the `func new` command using the `--template` option to select your trigger template. The following example creates an HTTP trigger named `MyHttpTrigger`:

```
func new --template "Http Trigger" --name MyHttpTrigger
```

This example creates a Queue Storage trigger named `MyQueueTrigger`:

```
func new --template "Azure Queue Storage Trigger" --name MyQueueTrigger
```

The following considerations apply when adding functions:

- When you run `func new` without the `--template` option, you're prompted to choose a template.
- Use the [`func templates list`](functions-core-tools-reference#func-templates-list) command to see the complete list of available templates for your language.
- When you add a trigger that connects to a service, you'll also need to add an application setting that references a connection string or a managed identity to the local.settings.json file. Using app settings in this way prevents you from having to embed credentials in your code. For more information, see Work with app settings locally.

- Core Tools also adds a reference to the specific binding extension to your C# project.

To learn more about the available options for the `func new` command, see the [`func new`](functions-core-tools-reference#func-new) reference.

## Add a binding to your function

Functions provides a set of service-specific input and output bindings, which make it easier for your function to connection to other Azure services without having to use the service-specific client SDKs. For more information, see [Azure Functions triggers and bindings concepts](functions-triggers-bindings).

To add an input or output binding to an existing function, you must manually update the function definition.

The following example shows the function definition after adding a [Queue Storage output binding](functions-bindings-storage-queue-output) to an [HTTP triggered function](functions-bindings-http-webhook-trigger):

**Isolated process**
Because an HTTP triggered function also returns an HTTP response, the function returns a `MultiResponse` object, which represents both the HTTP and queue output.

```csharp
[Function("HttpExample")]
public static MultiResponse Run([HttpTrigger(AuthorizationLevel.Function, "get", "post")] HttpRequest req,
    FunctionContext executionContext)
{
```

This example is the definition of the `MultiResponse` object that includes the output binding:

```csharp
public class MultiResponse
{
    [QueueOutput("outqueue",Connection = "AzureWebJobsStorage")]
    public string[] Messages { get; set; }
    public IActionResult HttpResponse { get; set; }
}
```

When applying that example to your own project, you might need to change `HttpRequest` to `HttpRequestData` and `IActionResult` to `HttpResponseData`, depending on if you are using [ASP.NET Core integration](dotnet-isolated-process-guide#aspnet-core-integration) or not.

**In-process**

```csharp
[FunctionName("HttpExample")]
public static async Task<IActionResult> Run(
    [HttpTrigger(AuthorizationLevel.Function, "get", "post", Route = null)] HttpRequest req, 
    [Queue("outqueue"),StorageAccount("AzureWebJobsStorage")] ICollector<string> msg, 
    ILogger log)
```

Messages are sent to the queue when the function completes. The way you define the output binding depends on your process model. For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=csharp#manually-add-bindings-based-on-examples).

```java
@FunctionName("HttpExample")
public HttpResponseMessage run(
        @HttpTrigger(name = "req", methods = {HttpMethod.GET, HttpMethod.POST}, authLevel = AuthorizationLevel.ANONYMOUS) 
        HttpRequestMessage<Optional<String>> request, 
        @QueueOutput(name = "msg", queueName = "outqueue", 
        connection = "AzureWebJobsStorage") OutputBinding<String> msg, 
        final ExecutionContext context) {
```

For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=java#manually-add-bindings-based-on-examples).

**v4**

```javascript
const { app, output } = require('@azure/functions');

const sendToQueue = output.storageQueue({
  queueName: 'outqueue',
  connection: 'AzureWebJobsStorage',
});

app.http('HttpExample', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  extraOutputs: [sendToQueue],
  handler: async (request, context) => {
    try {
      context.log(`Http function processed request for url "${request.url}"`);

      const name = request.query.get('name') || (await request.text());
      context.log(`Name: ${name}`);

      if (name) {
        const msg = `Name passed to the function ${name}`;
        context.extraOutputs.set(sendToQueue, [msg]);
        return { body: msg };
      } else {
        context.log('Missing required data');
        return { status: 404, body: 'Missing required data' };
      }
    } catch (error) {
      context.log(`Error: ${error}`);
      return { status: 500, body: 'Internal Server Error' };
    }
  },
});
```

**v3**

```json
{
  "bindings": [
    {
      "authLevel": "function",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["get", "post"]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    },
    {
      "type": "queue",
      "direction": "out",
      "name": "msg",
      "queueName": "outqueue",
      "connection": "AzureWebJobsStorage"
    }
  ]
}
```

The way you define the output binding depends on the version of your Node.js model. For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=javascript#manually-add-bindings-based-on-examples).

```powershell
$outputMsg = $name
Push-OutputBinding -name msg -Value $outputMsg
```

For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=powershell#manually-add-bindings-based-on-examples).

**v2**

```python
@app.route(route="HttpExample")
@app.queue_output(arg_name="msg", queue_name="outqueue", connection="AzureWebJobsStorage")
def HttpExample(req: func.HttpRequest, msg: func.Out [func.QueueMessage]) -> func.HttpResponse:
    logging.info('Python HTTP trigger function processed a request.')
```

**v1**

```json
{
  "bindings": [
    {
      "authLevel": "function",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["get", "post"]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    },
    {
      "type": "queue",
      "direction": "out",
      "name": "msg",
      "queueName": "outqueue",
      "connection": "AzureWebJobsStorage"
    }
  ]
}
```

The way you define the output binding depends on the version of your Python model. For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=python#manually-add-bindings-based-on-examples).

**v4**

```typescript
import {
  app,
  output,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
  StorageQueueOutput,
} from '@azure/functions';

const sendToQueue: StorageQueueOutput = output.storageQueue({
  queueName: 'outqueue',
  connection: 'AzureWebJobsStorage',
});

export async function HttpExample(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    context.log(`Http function processed request for url "${request.url}"`);

    const name = request.query.get('name') || (await request.text());
    context.log(`Name: ${name}`);

    if (name) {
      const msg = `Name passed to the function ${name}`;
      context.extraOutputs.set(sendToQueue, [msg]);
      return { body: msg };
    } else {
      context.log('Missing required data');
      return { status: 404, body: 'Missing required data' };
    }
  } catch (error) {
    context.log(`Error: ${error}`);
    return { status: 500, body: 'Internal Server Error' };
  }
}

app.http('HttpExample', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: HttpExample,
});
```

**v3**

```json
{
  "bindings": [
    {
      "authLevel": "function",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["get", "post"]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    },
    {
      "type": "queue",
      "direction": "out",
      "name": "msg",
      "queueName": "outqueue",
      "connection": "AzureWebJobsStorage"
    }
  ]
}
```

The way you define the output binding depends on the version of your Node.js model. For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=typescript#manually-add-bindings-based-on-examples).

The following considerations apply when adding bindings to a function:

- For languages that define functions using the *function.json* configuration file, Visual Studio Code simplifies the process of adding bindings to an existing function definition. For more information, see [Connect functions to Azure services using bindings](add-bindings-existing-function#visual-studio-code).

- When you add bindings that connect to a service, you must also add an application setting that references a connection string or managed identity to the local.settings.json file. For more information, see Work with app settings locally.

- When you add a supported binding, the extension should already be installed when your app uses extension bundle. For more information, see [extension bundles](extension-bundles).

- When you add a binding that requires a new binding extension, you must also add a reference to that specific binding extension in your C# project.

For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=csharp#manually-add-bindings-based-on-examples).

For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=java#manually-add-bindings-based-on-examples).

For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=javascript#manually-add-bindings-based-on-examples).

For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=powershell#manually-add-bindings-based-on-examples).

For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=python#manually-add-bindings-based-on-examples).

For more information, including links to example binding code that you can refer to, see [Add bindings to a function](add-bindings-existing-function?tabs=typescript#manually-add-bindings-based-on-examples).

## Start the Functions runtime

Before you can run or debug the functions in your project, you need to start the Functions host from the root directory of your project. The host enables triggers for all functions in the project. Use this command to start the local runtime:

```
mvn clean package 
mvn azure-functions:run
```

**Isolated worker model**

```
func start
```

**In-process model**

```
func start
```

Important

Starting with version 4.0.6517 of the Core Tools, in-process model projects must reference [version 4.5.0 or later of `Microsoft.NET.Sdk.Functions`](https://www.nuget.org/packages/Microsoft.NET.Sdk.Functions/4.5.0). If an earlier version is used, the `func start` command will error.

```
func start
```

```
npm install
npm start     
```

This command must be [run in a virtual environment](how-to-create-function-azure-cli?pivots=programming-language-python).

When the Functions host starts, it outputs a list of functions in the project, including the URLs of any HTTP-triggered functions, like in this example:

```

Found the following functions:
Host.Functions.MyHttpTrigger

Job host started
Http Function MyHttpTrigger: http://localhost:7071/api/MyHttpTrigger
```

How your functions are loaded depends on your project configuration. To learn more, see [Registering a function](functions-reference-node#registering-a-function).

Keep in mind the following considerations when running your functions locally:

- By default, authorization isn't enforced locally for HTTP endpoints. This means that all local HTTP requests are handled as `authLevel = "anonymous"`. For more information, see [Authorization level](functions-bindings-http-webhook-trigger#http-auth). You can use the `--enableAuth` option to require authorization when running locally. For more information, see [`func start`](functions-core-tools-reference?tabs=v2#func-start)
- You can use the local Azurite emulator when locally running functions that require access to Azure Storage services (Queue Storage, Blob Storage, and Table Storage) without having to connect to these services in Azure. When using local emulation, make sure to start Azurite before starting the local host (func.exe). For more information, see [Local storage emulation](functions-develop-local#local-storage-emulator).

- You can use local Azurite emulation to meet the storage requirement of the Python v2 worker.

- You can trigger non-HTTP functions locally without connecting to a live service. For more information, see [Run a local function](functions-run-local?tabs=non-http-trigger#run-a-local-function).
- When you include your Application Insights connection information in the local.settings.json file, local log data is written to the specific Application Insights instance. To keep local telemetry data separate from production data, consider using a separate Application Insights instance for development and testing.

- When using version 1.x of the Core Tools, instead use the `func host start` command to start the local runtime.

## Run a local function

With your local Functions host (func.exe) running, you can now trigger individual functions to run and debug your function code. The way in which you execute an individual function depends on its trigger type.

Note

Examples in this topic use the cURL tool to send HTTP requests from the terminal or a command prompt. You can use a tool of your choice to send HTTP requests to the local server. The cURL tool is available by default on Linux-based systems and Windows 10 build 17063 and later. On older Windows, you must first download and install the [cURL tool](https://curl.haxx.se/).

**HTTP trigger**
HTTP triggers are started by sending an HTTP request to the local endpoint and port as displayed in the func.exe output, which has this general format:

```
http://localhost:<PORT>/api/<FUNCTION_NAME>
```

In this URL template, `<FUNCTION_NAME>` is the name of the function or route and `<PORT>` is the local port on which func.exe is listening.

For example, this cURL command triggers the `MyHttpTrigger` quickstart function from a GET request with the *name* parameter passed in the query string:

```
curl --get http://localhost:7071/api/MyHttpTrigger?name=Azure%20Rocks
```

This example is the same function called from a POST request passing *name* in the request body, shown for both Bash shell and Windows command line:

```bash
curl --request POST http://localhost:7071/api/MyHttpTrigger --data '{"name":"Azure Rocks"}'
```

```cmd
curl --request POST http://localhost:7071/api/MyHttpTrigger --data "{'name':'Azure Rocks'}"
```

The following considerations apply when calling HTTP endpoints locally:

- You can make GET requests from a browser passing data in the query string. For all other HTTP methods, you must use an HTTP testing tool that also keeps your data secure. For more information, see [HTTP test tools](functions-develop-local#http-test-tools).
- Make sure to use the same server name and port that the Functions host is listening on. You see an endpoint like this in the output generated when starting the Function host. You can call this URL using any HTTP method supported by the trigger.

**Non-HTTP trigger**
There are two ways to execute non-HTTP triggers locally. First, you can connect to live Azure services, such as Azure Storage and Azure Service Bus. This directly mirrors the behavior of your function when running in Azure. When using live services, make sure to include the required named connection strings in the local settings file. You may consider using a different service connection during development than you do in production by using a different connection string in the local.settings.json file than you use in the function app settings in Azure.

Event Grid triggers require extra configuration to run locally.

You can also run a non-HTTP function locally using REST by calling a special endpoint called an *administrator endpoint*. Use this format to call the `admin` endpoint and trigger a specific non-HTTP function:

```
http://localhost:<PORT>/admin/functions/<FUNCTION_NAME>
```

In this URL template, `<FUNCTION_NAME>` is the name of the function or route and `<PORT>` is the local port on which func.exe is listening.

You can optionally pass test data to the execution in the body of the POST request. To pass test data, you must supply the data in the body of a POST request message, which has this JSON format:

```JSON
{
    "input": "<TRIGGER_INPUT>"
}
```

The `<TRIGGER_INPUT>` value contains data in a format expected by the function. This cURL example is shown for both Bash shell and Windows command line:

```bash
curl --request POST -H "Content-Type:application/json" --data '{"input":"sample queue data"}' http://localhost:7071/admin/functions/QueueTrigger
```

```cmd
curl --request POST -H "Content-Type:application/json" --data "{'input':'sample queue data'}" http://localhost:7071/admin/functions/QueueTrigger
```

The previous examples generate a POST request that passes a string `sample queue data` to a function named `QueueTrigger` function, which simulates data arriving in the queue and triggering the function

The following considerations apply when using the administrator endpoint for local testing:

- You can call the `functions` administrator endpoint (`http://localhost:{port}/admin/functions/`) to return a list of administrator URLs for all available functions, both HTTP triggered and non-HTTP triggered.
- Authentication and authorization are bypassed when running locally. The same APIs exist in Azure, but when you try to call the same administrator endpoints in Azure, you must provide an access key. To learn more, see [Work with access keys](function-keys-how-to).
- Access keys are valuable shared secrets. When used locally, they must be securely stored outside of source control. Because authentication and authorization aren't required by Functions when running locally, you should avoid using and storing access keys unless your scenarios require it.
- Calling an administrator endpoint and passing test data is similar to using the **Test** tab in the Azure portal.
- If the input is a complex JSON object, additional formatting is needed. The data must be properly escaped and include a `SystemProperties` object. This example shows a properly escaped JSON string with both a `testData` object and `SystemProperties`:`'{"input": "{\"SystemProperties\":{},\"testData\":{\"testid\":\"123\"}"}'`

**Event Grid trigger**
Event Grid triggers have specific requirements to enable local testing. For more information, see [Local testing with viewer web app](event-grid-how-tos#local-testing-with-viewer-web-app).

## Publish to Azure

The Azure Functions Core Tools supports three types of deployment:

| Deployment type | Command | Description |
| --- | --- | --- |
| Project files | [`func azure functionapp publish`](functions-core-tools-reference#func-azure-functionapp-publish) | Deploys function project files directly to your function app using [zip deployment](functions-deployment-technologies#zip-deploy). |
| Azure Container Apps | `func azurecontainerapps deploy` | Deploys a containerized function app to an existing Container Apps environment. |
| Kubernetes cluster | `func kubernetes deploy` | Deploys your Linux function app as a custom Docker container to a Kubernetes cluster. |

You must have either the [Azure CLI](/en-us/cli/azure/install-azure-cli) or [Azure PowerShell](/en-us/powershell/azure/install-azure-powershell) installed locally to be able to publish to Azure from Core Tools. By default, Core Tools uses these tools to authenticate with your Azure account.

If you don't have these tools installed, you need to instead [get a valid access token](/en-us/cli/azure/account#az-account-get-access-token) to use during deployment. You can present an access token using the `--access-token` option in the deployment commands.

## Deploy project files

To publish your local code to a function app in Azure, use the [`func azure functionapp publish`](functions-core-tools-reference#func-azure-functionapp-publish) command, as in the following example:

```
func azure functionapp publish <FunctionAppName>
```

This command publishes project files from the current directory to the `<FunctionAppName>` as a .zip deployment package. If the project requires compilation, it's done remotely during deployment.

Java uses Maven to publish your local project to Azure instead of Core Tools. Use the following Maven command to publish your project to Azure:

```
mvn azure-functions:deploy
```

When you run this command, Azure resources are created during the initial deployment based on the settings in your *pom.xml* file. For more information, see [Deploy the function project to Azure](how-to-create-function-azure-cli?pivots=programming-language-java#deploy-the-function-project-to-azure).

The following considerations apply to this kind of deployment:

- Publishing overwrites existing files in the remote function app deployment.
- You must have already [created a function app in your Azure subscription](functions-cli-samples#create). Core Tools deploys your project code to this function app resource. To learn how to create a function app from the command prompt or terminal window using the Azure CLI or Azure PowerShell, see [Create a Function App for serverless execution](scripts/functions-cli-create-serverless). You can also [create these resources in the Azure portal](functions-create-function-app-portal#create-a-function-app). You get an error when you try to publish to a `<FunctionAppName>` that doesn't exist in your subscription.
- A project folder may contain language-specific files and directories that shouldn't be published. Excluded items are listed in a .funcignore file in the root project folder.
- By default, your project is deployed so that it [runs from the deployment package](run-functions-from-deployment-package). To disable this recommended deployment mode, use the [`--nozip` option](functions-core-tools-reference?tabs=v2#func-azure-functionapp-publish).
- A [remote build](functions-deployment-technologies#remote-build) is performed on compiled projects. This can be controlled by using the [`--no-build` option](functions-core-tools-reference?tabs=v2#func-azure-functionapp-publish).
- Use the [`--publish-local-settings`](functions-core-tools-reference?tabs=v2#func-azure-functionapp-publish) option to automatically create app settings in your function app based on values in the local.settings.json file.
- To publish to a specific named slot in your function app, use the [`--slot` option](functions-core-tools-reference#func-azure-functionapp-publish).

## Deploy containers

Core Tools lets you deploy your [containerized function app](functions-create-container-registry) to both managed Azure Container Apps environments and Kubernetes clusters that you manage.

**Container Apps**
Use the following [`func azurecontainerapps deploy`](functions-core-tools-reference#func-azurecontainerapps-deploy) command to deploy an existing container image to a Container Apps environment:

```command
func azurecontainerapps deploy --name <APP_NAME> --environment <ENVIRONMENT_NAME> --storage-account <STORAGE_CONNECTION> --resource-group <RESOURCE_GROUP> --image-name <IMAGE_NAME> [--registry-password] [--registry-server] [--registry-username]

```

When you deploy to an Azure Container Apps environment, the following considerations apply:

- The environment and storage account must already exist. The storage account connection string you provide is used by the deployed function app.
- You don't need to create a separate function app resource when deploying to Container Apps.
- Storage connection strings and other service credentials are important secrets. Make sure to securely store any script files using `func azurecontainerapps deploy` and don't store them in any publicly accessible source control systems. You can encrypt the local.settings.json file for added security.

For more information, see [Azure Container Apps hosting of Azure Functions](functions-container-apps-hosting).

**Kubernetes cluster**
The following [`func kubernetes deploy`](functions-core-tools-reference#func-kubernetes-deploy) command uses the Dockerfile to generate a container in the specified registry and deploy it to the default Kubernetes cluster.

```command
func kubernetes deploy --name <DEPLOYMENT_NAME> --registry <REGISTRY_USERNAME> 
```

Azure Functions on Kubernetes using KEDA is an open-source effort that you can use free of cost. Best-effort support is provided by contributors and from the community. To learn more, see [Deploying a function app to Kubernetes](functions-kubernetes-keda#deploying-a-function-app-to-kubernetes).

## Work with app settings locally

When your function app runs in Azure, settings required by your functions are [stored encrypted in app settings](functions-how-to-use-azure-function-app-settings#settings). During local development, these settings are instead added to the `Values` collection in the *local.settings.json* file. The *local.settings.json* file also stores settings used by local development tools.

Items in the `Values` collection in your project's *local.settings.json* file are intended to mirror items in your function app's [application settings](functions-how-to-use-azure-function-app-settings#settings) in Azure.

The following considerations apply when working with the local settings file:

- Because the local.settings.json may contain secrets, such as connection strings, you should never store it in a remote repository. Core Tools helps you encrypt this local settings file for improved security. For more information, see [Local settings file](functions-develop-local#local-settings-file). You can also encrypt the local.settings.json file for added security.
- By default, local settings aren't migrated automatically when the project is published to Azure. Use the [`--publish-local-settings`](functions-core-tools-reference?tabs=v2#func-azure-functionapp-publish) option when you publish your project files to make sure these settings are added to the function app in Azure. Values in the `ConnectionStrings` section are never published. You can also upload settings from the local.settings.json file at any time.
- You can download and overwrite settings in your local.settings.json file with settings from your function app in Azure. For more information, see Download application settings.

- The function app settings values can also be read in your code as environment variables. For more information, see [Environment variables](functions-dotnet-class-library#environment-variables).

- The function app settings values can also be read in your code as environment variables. For more information, see [Environment variables](functions-reference-java#environment-variables).

- The function app settings values can also be read in your code as environment variables. For more information, see [Environment variables](functions-reference-node#environment-variables).

- The function app settings values can also be read in your code as environment variables. For more information, see [Environment variables](functions-reference-powershell#environment-variables).

- The function app settings values can also be read in your code as environment variables. For more information, see [Environment variables](functions-reference-python#environment-variables).

- When no valid storage connection string is set for [`AzureWebJobsStorage`](functions-app-settings#azurewebjobsstorage) and a local storage emulator isn't being used, an error is shown. You can use Core Tools to download a specific connection string from any of your Azure Storage accounts.

### Download application settings

From the project root, use the following command to download all application settings from the `myfunctionapp12345` app in Azure:

```command
func azure functionapp fetch-app-settings myfunctionapp12345
```

This command overwrites any existing settings in the local.settings.json file with values from Azure. When not already present, new items are added to the collection. For more information, see the [`func azure functionapp fetch-app-settings`](functions-core-tools-reference#func-azure-functionapp-fetch-app-settings) command.

### Download a storage connection string

Core Tools also make it easy to get the connection string of any storage account to which you have access. From the project root, use the following command to download the connection string from a storage account named `mystorage12345`.

```command
func azure storage fetch-connection-string mystorage12345
```

This command adds a setting named `mystorage12345_STORAGE` to the local.settings.json file, which contains the connection string for the `mystorage12345` account. For more information, see the [`func azure storage fetch-connection-string`](functions-core-tools-reference#func-azure-storage-fetch-connection-string) command.

For improved security during development, consider encrypting the local.settings.json file.

### Upload local settings to Azure

When you publish your project files to Azure without using the `--publish-local-settings` option, settings in the local.settings.json file aren't set in your function app. You can always rerun the `func azure functionapp publish` with the `--publish-settings-only` option to upload just the settings without republishing the project files.

The following example uploads just settings from the `Values` collection in the local.settings.json file to the function app in Azure named `myfunctionapp12345`:

```command
func azure functionapp publish myfunctionapp12345 --publish-settings-only
```

### Encrypt the local settings file

To improve security of connection strings and other valuable data in your local settings, Core Tools lets you encrypt the local.settings.json file. When this file is encrypted, the runtime automatically decrypts the settings when needed the same way it does with application setting in Azure. You can also decrypt a locally encrypted file to work with the settings.

Use the following command to encrypt the local settings file for the project:

```command
func settings encrypt
```

Use the following command to decrypt an encrypted local setting, so that you can work with it:

```command
func settings decrypt
```

When the settings file is encrypted and decrypted, the file's `IsEncrypted` setting also gets updated.

## Configure binding extensions

[Functions triggers and bindings](functions-triggers-bindings) are implemented as .NET extension (NuGet) packages. To be able to use a specific binding extension, that extension must be installed in the project.

This section doesn't apply to version 1.x of the Functions runtime. In version 1.x, supported bindings were included in the core product extension.

For C# class library projects, add references to the specific NuGet packages for the binding extensions required by your functions. C# script (.csx) project must use [extension bundles](extension-bundles).

Functions provides *extension bundles* to make is easy to work with binding extensions in your project. Extension bundles, which are versioned and defined in the host.json file, install a complete set of compatible binding extension packages for your app. Your host.json should already have extension bundles enabled. If for some reason you need to add or update the extension bundle in the host.json file, see [Extension bundles](extension-bundles).

If you must use a binding extension or an extension version not in a supported bundle, you need to manually install extensions. For such rare scenarios, see the [`func extensions install`](functions-core-tools-reference#func-extensions-install) command.

## Core Tools versions

Major versions of Azure Functions Core Tools are linked to specific major versions of the Azure Functions runtime. For example, version 4.x of Core Tools supports version 4.x of the Functions runtime. This version is the recommended major version of both the Functions runtime and Core Tools. You can determine the latest release version of Core Tools in the [Azure Functions Core Tools repository](https://github.com/Azure/azure-functions-core-tools/releases/latest).

 Starting with version 4.0.6517 of the Core Tools, in-process model projects must reference [version 4.5.0 or later of `Microsoft.NET.Sdk.Functions`](https://www.nuget.org/packages/Microsoft.NET.Sdk.Functions/4.5.0). If an earlier version is used, the `func start` command will error.

Run the following command to determine the version of your current Core Tools installation:

```command
func --version
```

Unless otherwise noted, the examples in this article are for version 4.x.

The following considerations apply to Core Tools installations:

- You can only install one version of Core Tools on a given computer.
- When upgrading to the latest version of Core Tools, you should use the same method that you used for original installation to perform the upgrade. For example, if you used an MSI on Windows, uninstall the current MSI and install the latest one. Or if you used npm, rerun the `npm  install command`.
- Version 2.x and 3.x of Core Tools were used with versions 2.x and 3.x of the Functions runtime, which have reached their end of support. For more information, see [Azure Functions runtime versions overview](functions-versions).

- Version 1.x of Core Tools is required when using version 1.x of the Functions Runtime, which is still supported. This version of Core Tools can only be run locally on Windows computers. If you're currently running on version 1.x, you should consider [migrating your app to version 4.x](migrate-version-1-version-4) today.

# Azure Functions Scale and Hosting | Microsoft Learn

When you create a function app in Azure, you must choose a hosting option for your app. Azure provides you with these hosting options for your function code:

| Hosting option | Service | Availability | Container support |
| --- | --- | --- | --- |
| **[Flex Consumption plan](flex-consumption-plan)** | Azure Functions | Generally available (GA) | None |
| **[Premium plan](functions-premium-plan)** | Azure Functions | GA | Linux |
| **[Dedicated plan](dedicated-plan)** | Azure Functions | GA | Linux |
| **[Container Apps](../container-apps/functions-overview)** | Azure Container Apps | GA | Linux |
| **[Consumption plan](consumption-plan)** | Azure Functions | Windows - GALinux - Retired | None |

Important

After 30 September 2028, the option to host your function app on Linux in a Consumption plan is retired. To avoid disruptions, migrate your existing Consumption plan apps that run on Linux to the [Flex Consumption plan](flex-consumption-plan) before that date. Apps running on Windows in a Consumption plan aren't affected by this change.

After 30 September 2025, no new features and no new language stack support are added to the Linux Consumption plan. The last supported language versions for Linux Consumption are: .NET 9, Python 3.12, Node.js 22, PowerShell 7.4, and Java 21. Newer language versions aren't supported for Linux Consumption.

For more information, see [Migrate Consumption plan apps to the Flex Consumption plan](migration/migrate-plan-consumption-to-flex).

The Azure App Service infrastructure on both Linux and Windows virtual machines facilitates the Azure Functions hosting options. The hosting option you choose dictates the following behaviors:

- How your function app is scaled.
- The resources available to each function app instance.
- Support for advanced functionality, such as Azure Virtual Network connectivity.
- Support for Linux containers.

The plan you choose also impacts the costs for running your function code. For more information, see Billing.

This article provides a detailed comparison between the various hosting options. To learn more about running and managing your function code in Linux containers, see [Linux container support in Azure Functions](container-concepts).

## Overview of plans

The following table summarizes the benefits of the various options for Azure functions hosting.

| Option | Benefits |
| --- | --- |
| **[Flex Consumption plan](flex-consumption-plan)** | Experience fast horizontal scaling, with flexible compute options, virtual network integration, and serverless pay-as-you-go billing.In the Flex Consumption plan, function instances dynamically scale out (up to 1,000) based on configured per-instance concurrency, incoming events, and per-function workloads for optimal efficiency.Consider the Flex Consumption plan when:✔ You need a serverless host for your function code, paying only for on-demand executions.✔ You require virtual network connectivity for secure access to Azure resources.✔ Your workloads are variable and can go from no activity to demanding rapid, event-driven scaling.✔ You want to customize compute with memory sizes (512 MB, 2,048 MB, or 4,096 MB) and reduce cold starts via one or more pre-provisioned (always-ready) instances. |
| **[Premium plan](functions-premium-plan)** | Automatically scales based on demand using prewarmed workers, which run applications with no delay after being idle, runs on more powerful instances, and connects to virtual networks. Consider the Azure Functions Premium plan in the following situations: ✔ Your function apps run continuously, or nearly continuously.✔ You want more control of your instances and want to deploy multiple function apps on the same plan with event-driven scaling.✔ You have a high number of small executions and a high execution bill, but low GB seconds in the Consumption plan.✔ You need more CPU or memory options than are provided by consumption plans.✔ Your code needs to run longer than the maximum execution time allowed on the Consumption plan.✔ You require virtual network connectivity for secure access to Azure resources.✔ You want to provide a custom Linux image in which to run your functions. |
| **[Dedicated plan](dedicated-plan)** | Run your functions within an App Service plan at regular [App Service plan rates](https://azure.microsoft.com/pricing/details/app-service/windows/).Best for long-running scenarios where [Durable Functions](durable/durable-functions-overview) can't be used. Consider an App Service plan in the following situations:✔ You have existing and underutilized virtual machines that are already running other App Service instances.✔ You must have fully predictable billing, or you need to manually scale instances.✔ You want to run multiple web apps and function apps on the same plan✔ You need access to larger compute size choices.✔ Full compute isolation and secure network access provided by an App Service Environment (ASE).✔ Very high memory usage and high scale (ASE). |
| **[Container Apps](../container-apps/functions-overview)** | Create and deploy containerized function apps in a fully managed environment hosted by Azure Container Apps.Use the Azure Functions programming model to build event-driven, serverless, cloud native function apps. Run your functions alongside other microservices, APIs, websites, and workflows as container-hosted programs. Consider hosting your functions on Container Apps in the following situations:✔ You want control of the container image and want to package custom libraries with your function code to support line-of-business apps.✔ You need to migrate code execution from on-premises or legacy apps to cloud native microservices running in containers.✔ When you want to avoid the overhead and complexity of managing Kubernetes clusters and dedicated compute.✔ Your functions need high-end processing power provided by dedicated GPU compute resources. |
| **[Consumption plan](consumption-plan)** | Pay for compute resources only when your functions are running (pay-as-you-go) with automatic scale on Windows.On the Consumption plan, function instances are dynamically added and removed based on the number of incoming events.Consider the Consumption plan when:✔ You have a dependency on Windows. For example, using the v1 runtime, the full .NET Framework, or Windows-specific features like certain PowerShell modules.✔ You want a serverless billing model and pay only when your functions are running. |

The remaining tables in this article compare hosting options based on various features and behaviors.

## Operating system support

This table shows operating system support for the hosting options.

| Hosting | Linux^1^deployment | Windows^2^deployment |
| --- | --- | --- |
| **[Flex Consumption plan](flex-consumption-plan)** | ✅ Code-only❌ Container (not supported) | ❌ Not supported |
| **[Premium plan](functions-premium-plan)** | ✅ Code-only✅ Container | ✅ Code-only |
| **[Dedicated plan](dedicated-plan)** | ✅ Code-only✅ Container | ✅ Code-only |
| **[Container Apps](../container-apps/functions-overview)** | ✅ Container-only | ❌ Not supported |
| **[Consumption plan](consumption-plan)**^3^ | ✅ Code-only (Retired)❌ Container (not supported) | ✅ Code-only |

1. Linux is the only supported operating system for the [Python runtime stack](functions-reference-python).
2. Windows deployments are code-only. Azure Functions doesn't currently support Windows containers.
3. The ability to run your app on Linux in a Consumption plan will be retired on 30 September 2028. For more information, see [Consumption plan](consumption-plan).

## Function app timeout duration

The `functionTimeout` property in the [host.json](functions-host-json#functiontimeout) project file sets the timeout duration for functions in a function app. This property applies specifically to function executions. After the trigger starts function execution, the function needs to return or respond within the timeout duration. When an execution exceeds this duration, a timeout error occurs and the language worker process restarts. For C# apps running in-process, the host process itself restarts. To avoid timeouts and subsequent process restarts, it's important to [write robust functions](functions-best-practices#write-robust-functions). For more information, see [Improve Azure Functions performance and reliability](performance-reliability#make-sure-background-tasks-complete).

The following table shows the default and maximum values (in minutes) for specific plans:

| Plan | Default | Maximum^1^ |
| --- | --- | --- |
| **[Flex Consumption plan](flex-consumption-plan)** | 30 | Unbounded^2^ |
| **[Premium plan](functions-premium-plan)** | 30^4^ | Unbounded^2^ |
| **[Dedicated plan](dedicated-plan)** | 30^4^ | Unbounded^3^ |
| **[Container Apps](../container-apps/functions-overview)** | 30 | Unbounded^5^ |
| **[Consumption plan](consumption-plan)** | 5 | 10 |

1. Regardless of the function app timeout setting, 230 seconds is the maximum amount of time that an HTTP triggered function can take to respond to a request. This limit exists because of the [default idle timeout of Azure Load Balancer](../app-service/faq-availability-performance-application-issues#why-does-my-request-time-out-after-230-seconds). For longer processing times, consider using the [Durable Functions async pattern](durable/durable-functions-overview#async-http) or [defer the actual work and return an immediate response](performance-reliability#avoid-long-running-functions).
2. There's no maximum execution timeout duration enforced. However, the grace period given to a function execution is 60 minutes [during scale in](event-driven-scaling#scale-in-behaviors) for the Flex Consumption and Premium plans, and a grace period of 10 minutes is given during platform updates.
3. Requires the App Service plan be set to [Always On](/en-us/azure/azure-functions/dedicated-plan#always-on). A grace period of 10 minutes is given during platform updates.
4. The default timeout for version 1.x of the Functions host runtime is *unbounded*.
5. When the [minimum number of replicas](../container-apps/scale-app#scale-definition) is set to zero, the default timeout depends on the specific triggers used in the app.

These values assume that the Azure Functions host process starts and runs correctly. There's a maximum timeout of 60 seconds for the language-specific worker process to also start. The worker process startup timeout isn't currently configurable.

## Language support

For details on current native language stack support in Functions, see [Supported languages in Azure Functions](supported-languages).

## Scale

The following table compares the scaling behaviors of the various hosting plans. Maximum instances are given on a per-function app (Consumption) or per-plan (Premium/Dedicated) basis, unless otherwise indicated.

| Plan | Scale out | Max # instances |
| --- | --- | --- |
| **[Flex Consumption plan](flex-consumption-plan)** | Fast event-driven scaling decisions are calculated on a per-function basis, called [per-function scaling](flex-consumption-plan#per-function-scaling), which provides a more deterministic way of scaling the functions in your app. Except for HTTP, Blob storage (Event Grid), and Durable Functions, all other function trigger types in your app scale on independent instances. All HTTP triggers in your app scale together as a group on the same instances, as do all Blob storage (Event Grid) triggers. All Durable Functions triggers also share instances and scale together. | 1000^1^ |
| **[Premium plan](functions-premium-plan)** | [Event driven](event-driven-scaling). Scale out automatically, even during periods of high load. Azure Functions infrastructure scales CPU and memory resources by adding more instances of the Functions host, based on the number of events that its functions are triggered on. | **Windows:** 100^6^**Linux:** 20-100^2,6^ |
| **[Dedicated plan](dedicated-plan)** | Manual/autoscale | 10-30^3^100 (ASE) |
| **[Container Apps](../container-apps/functions-overview)** | [Event driven](event-driven-scaling). Scale out automatically, even during periods of high load. Azure Functions infrastructure scales CPU and memory resources by adding more instances of the Functions host, based on the number of events that its functions are triggered on. | 300-1000^4^ |
| **[Consumption plan](consumption-plan)** | [Event driven](event-driven-scaling). Automatic scale based on the source of events. Functions infrastructure scales resources by adding more instances of the function host, based on the number of incoming trigger events. | **Windows:** 200**Linux:** 100^5^ |

1. Flex Consumption plan has a regional subscription quota that limits the total memory usage of all instances across a given region. For more information, see [Regional subscription memory quotas](flex-consumption-plan#regional-subscription-memory-quotas). Flex Consumption plans currently only support Linux.
2. In some regions, Linux apps on a Premium plan can scale to 100 instances. For more information, see the [Premium plan article](functions-premium-plan#region-max-scale-out).
3. For specific limits for the various App Service plan options, see the [App Service plan limits](../azure-resource-manager/management/azure-subscription-service-limits#azure-app-service-limits).
4. On Container Apps, the default is 10 instances, but you can set the [maximum number of replicas](../container-apps/scale-app#scale-definition), which has an overall maximum of 1000. This setting is honored as long as there's enough cores quota available. For more information, see [Quotas for Azure Container Apps](/en-us/azure/container-apps/quotas). When you create your function app from the Azure portal, you're limited to 300 instances.
5. During scale-out, there's currently a limit of 500 instances per subscription per hour for Linux apps on a Consumption plan.
6. For private endpoint restricted http triggers, scaling out is limited to at most 20 instances.

## Cold start behavior

| Plan | Details |
| --- | --- |
| **[Flex Consumption plan](flex-consumption-plan)** | Improved cold start even when scaled to zero. Supports [always ready instances](flex-consumption-plan#always-ready-instances) to further reduce the delay when provisioning new instances. |
| **[Premium plan](functions-premium-plan)** | Supports [always ready instances](functions-premium-plan#always-ready-instances) to avoid cold starts by letting you maintain one or more *perpetually warm* instances. |
| **[Dedicated plan](dedicated-plan)** | When it runs in a Dedicated plan, the Functions host can run continuously on a prescribed number of instances, which means that cold start isn't really an issue. |
| **[Container Apps](../container-apps/functions-overview)** | Depends on the [minimum number of replicas](../container-apps/scale-app#scale-definition): • When set to zero: apps can scale to zero when idle and some requests might have more latencies at startup.• When set to one or more: the host process runs continuously, which means that cold start isn't an issue. |
| **[Consumption plan](consumption-plan)** | Apps can scale to zero when idle, meaning some requests might have more latencies at startup. The consumption plan does have some optimizations to help decrease cold start time, including pulling from prewarmed placeholder functions that already have the host and language processes running. |

## Service limits

| Resource | [Flex Consumption plan](flex-consumption-plan) | [Premium plan](functions-premium-plan) | [Dedicated plan](dedicated-plan)/[ASE](../app-service/environment/overview) | [Container Apps](../container-apps/functions-overview) | [Consumption plan](consumption-plan) |
| --- | --- | --- | --- | --- | --- |
| Default [time-out duration](/en-us/azure/azure-functions/functions-scale#timeout) (min) | 30 | 30 | 30^1^ | 30^16^ | 5 |
| Max [time-out duration](/en-us/azure/azure-functions/functions-scale#timeout) (min) | unbounded^9^ | unbounded^9^ | unbounded^2^ | unbounded^17^ | 10 |
| Max outbound connections (per instance) | unbounded | unbounded | see [App Service limits](/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#azure-app-service-limits) | unbounded | 600 active (1200 total) |
| Max request size (MB)^3^ | 210 | 210 | 210 | 210 | 210 |
| Max query string length^3^ | 4096 | 4096 | 4096 | 4096 | 4096 |
| Max request URL length^3^ | 8192 | 8192 | 8192 | 8192 | 8192 |
| [ACU](/en-us/azure/virtual-machines/acu) per instance | 210-840 | 100-840/210-250^10^ | [varies](/en-us/azure/container-apps/billing) | 100 | varies |
| Max memory (GB per instance) | 4^14^ | 3.5-14 | 1.75-256/8-256 | [varies](/en-us/azure/container-apps/billing) | 1.5 |
| Max instance count (Windows | Linux)^15^ | n/a | 1000 | 20-100 | 10-30 (100 ASE)^11^ | 300-1000^18^ | 200 | 100 |
| Function apps per plan^13^ | 1 | 100 | unbounded^4^ | unbounded^4^ | 100 |
| [App Service plans](/en-us/azure/app-service/overview-hosting-plans) | n/a | 100 per resource group | 100 per resource group | n/a | 100 per [region](https://azure.microsoft.com/global-infrastructure/regions/) |
| [Deployment slots](/en-us/azure/azure-functions/functions-deployment-slots) per app^12^ | n/a | 3 | 1-20^11^ | not supported | 2 |
| Storage (temporary)^5^ | 0.8 GB | 21-140 GB | 11-140 GB | n/a | 0.5 GB |
| Storage (persisted) | 0 GB^7^ | 250 GB | 10-1000 GB^11^ | n/a | 1 GB^6,7^ |
| Custom domains per app | 25^8^ | 500 | 500 | not supported | 500^8^ |
| Custom domain [TSL/SSL support](/en-us/azure/app-service/configure-ssl-bindings) | unbounded SNI SSL and one IP SSL connection included | unbounded SNI SSL and one IP SSL connection included | unbounded SNI SSL and one IP SSL connection included | not supported | unbounded SNI SSL connection included |

Notes on service limits:

1. By default, the time-out for the Functions 1.x runtime in an App Service plan is unbounded.
2. Requires the App Service plan be set to [Always On](/en-us/azure/azure-functions/dedicated-plan#always-on). Pay at standard [rates](https://azure.microsoft.com/pricing/details/app-service/). A grace period of 10 minutes is given for HTTP triggered functions during platform updates but not for other triggers.
3. These limits are [set in the host](https://github.com/Azure/azure-functions-host/blob/dev/src/WebJobs.Script.WebHost/web.config).
4. The actual number of function apps that you can host depends on the activity of the apps, the size of the machine instances, and the corresponding resource utilization.
5. The storage limit is the total content size in temporary storage across all apps in the same App Service plan. For Consumption plans on Linux, the storage is currently 1.5 GB.
6. Consumption plan uses an Azure Files share for persisted storage. When you provide your own Azure Files share, the specific share size limits depend on the storage account you set for [WEBSITE_CONTENTAZUREFILECONNECTIONSTRING](/en-us/azure/azure-functions/functions-app-settings#website_contentazurefileconnectionstring).
7. On Linux, you must [explicitly mount your own Azure Files share](/en-us/azure/azure-functions/storage-considerations#mount-file-shares).
8. When your function app is hosted in a [Consumption plan](/en-us/azure/azure-functions/consumption-plan), only the CNAME option is supported. For function apps in a [Premium plan](/en-us/azure/azure-functions/functions-premium-plan) or an [App Service plan](/en-us/azure/azure-functions/dedicated-plan), you can map a custom domain using either a CNAME or an A record.
9. There's no maximum execution time-out duration enforced. However, the grace period given to a function execution is 60 minutes [during scale in](event-driven-scaling#scale-in-behaviors) and 10 minutes during platform updates.
10. Workers are roles that host customer apps. Workers are available in three fixed sizes: One vCPU/3.5 GB RAM; Two vCPU/7 GB RAM; Four vCPU/14 GB RAM.
11. See [App Service limits](/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#app-service-limits) for details.
12. Including the production slot.
13. There's currently a limit of 5,000 function apps in a given subscription.
14. Flex Consumption plan instance sizes are currently defined as 512 MB, 2,048 MB, or 4,096 MB. For more information, see [Instance memory](/en-us/azure/azure-functions/flex-consumption-plan#instance-sizes).
15. For details, see [Scale](functions-scale#scale) in the Hosting comparison article.
16. When the [minimum number of replicas](/en-us/azure/container-apps/scale-app#scale-definition) is set to zero, the default time-out depends on the specific triggers used in the app.
17. When the [minimum number of replicas](../container-apps/scale-app#scale-definition) is set to one or more.

## Networking features

| Feature | [Flex Consumption plan](flex-consumption-plan) | [Consumption plan](consumption-plan) | [Premium plan](functions-premium-plan) | [Dedicated plan](dedicated-plan)/[ASE](../app-service/environment/intro) | [Container Apps](../container-apps/functions-overview)^1^ |
| --- | --- | --- | --- | --- | --- |
| [Inbound IP restrictions](functions-networking-options#inbound-networking-features) | ✔ | ✔ | ✔ | ✔ | ✔ |
| [Inbound Private Endpoints](functions-networking-options#inbound-networking-features) | ✔ |  | ✔ | ✔ |  |
| [Virtual network integration](functions-networking-options#virtual-network-integration) | ✔ |  | ✔^2^ | ✔^3^ | ✔ |
| [Outbound IP restrictions](functions-networking-options#outbound-ip-restrictions) | ✔ |  | ✔ | ✔ | ✔ |

1. For more information, see [Networking in Azure Container Apps environment](../container-apps/networking).
2. There are special considerations when working with [virtual network triggers](functions-networking-options#virtual-network-triggers-non-http).
3. Only the Dedicated/ASE plan supports gateway-required virtual network integration.

## Billing

| Plan | Details |
| --- | --- |
| **[Flex Consumption plan](flex-consumption-plan)** | Billing is based on number of executions, the memory of instances when they're actively executing functions, plus the cost of any [always ready instances](flex-consumption-plan#always-ready-instances). For more information, see [Flex Consumption plan billing](flex-consumption-plan#billing). |
| **[Premium plan](functions-premium-plan)** | Premium plan is based on the number of core seconds and memory used across needed and prewarmed instances. At least one instance per plan must always be kept warm. This plan provides the most predictable pricing. |
| **[Dedicated plan](dedicated-plan)** | You pay the same for function apps in an App Service Plan as you would for other App Service resources, like web apps.For an ASE, there's a flat monthly rate that pays for the infrastructure and doesn't change with the size of the environment. There's also a cost per App Service plan vCPU. All apps hosted in an ASE are in the Isolated pricing model. For more information, see the [ASE overview article](../app-service/environment/overview#pricing). |
| **[Container Apps](../container-apps/functions-overview)** | Billing in Azure Container Apps is based on your plan type. For more information, see [Billing in Azure Container Apps](../container-apps/billing). |
| **[Consumption plan](consumption-plan)** | Pay only for the time your functions run. Billing is based on number of executions, execution time, and memory used. |

For a direct cost comparison between dynamic hosting plans (Consumption, Flex Consumption, and Premium), see the [Azure Functions pricing page](https://azure.microsoft.com/pricing/details/functions/). For pricing of the various Dedicated plan options, see the [App Service pricing page](https://azure.microsoft.com/pricing/details/app-service). For pricing Container Apps hosting, see [Azure Container Apps pricing](https://azure.microsoft.com/pricing/details/container-apps/).

## Limitations for creating new function apps in an existing resource group

In some cases, when trying to create a new hosting plan for your function app in an existing resource group you might receive one of the following errors:

- The pricing tier isn't allowed in this resource group
- &lt;SKU\_name&gt; workers aren't available in resource group &lt;resource\_group\_name&gt;

These errors can occur when the following conditions are met:

- You create a function app in an existing resource group that has yet to contain another function app or web app. For example, Linux Consumption apps aren't supported in the same resource group as Linux Dedicated or Linux Premium plans.
- Your new function app is created in the same region as the previous app.
- The previous app is in some way incompatible with your new app. This incompatibility can occur between versions, operating systems, or is due to other platform-level features, such as availability zone support.

Function app and web app plans are mapped to different pools of resources when they're created. Different plans require a different set of infrastructure capabilities. When you create an app in a resource group, that resource group is mapped and assigned to a specific pool of resources. If you try to create another plan in that resource group and the mapped pool doesn't have the required resources, the previously mentioned errors occur.

If this situation happens, create your function app and hosting plan in a new resource group instead.