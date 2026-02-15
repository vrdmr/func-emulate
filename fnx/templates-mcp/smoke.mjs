import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Launch the compiled server via node
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/src/server.js"],
});

const client = new Client({ name: "smoke-client", version: "0.0.1" });
await client.connect(transport);

// List tools to verify connection
const tools = await client.listTools();
process.stderr.write(`Tools: ${tools.tools.map(t => t.name).join(", ")}\n`);

// Call get_azure_functions_template tool for a Python HTTP trigger
const result = await client.callTool({
  name: "get_azure_functions_template",
  arguments: { 
    language: "python", 
    template: "HttpTrigger" 
  } 
});

if (result.isError) {
  console.error(result.content?.[0]?.text ?? "Error from server");
  process.exit(1);
}

const text = result.content?.find(c => c.type === "text")?.text ?? "";
console.log(text.substring(0, 500) + "...");

client.close();
transport.close();
