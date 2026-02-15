package com.function;

import com.microsoft.azure.functions.ExecutionContext;
import com.microsoft.azure.functions.HttpMethod;
import com.microsoft.azure.functions.HttpRequestMessage;
import com.microsoft.azure.functions.HttpResponseMessage;
import com.microsoft.azure.functions.HttpStatus;
import com.microsoft.azure.functions.OutputBinding;
import com.microsoft.azure.functions.annotation.BlobInput;
import com.microsoft.azure.functions.annotation.BlobOutput;
import com.microsoft.azure.functions.annotation.FunctionName;
import com.microsoft.azure.functions.annotation.HttpTrigger;
import com.microsoft.azure.functions.annotation.StorageAccount;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * Azure Functions with HTTP Trigger.
 */
public class Function {
    /**
     * The following example shows a Java function that uses the HttpTrigger
     * annotation to receive
     * a parameter containing the name of a file in a blob storage container.
     * The BlobInput annotation then reads the file and passes its contents to the
     * function as a byte[].
     * The BlobOutput annotation binds to OutputBinding outputItem, which is then
     * used by the function to
     * write the contents of the input blob to the configured storage container.
     */
    @FunctionName("copyBlobHttp")
    @StorageAccount("BlobStoreConnection")
    public HttpResponseMessage copyBlobHttp(
            @HttpTrigger(name = "req", methods = { HttpMethod.GET }) HttpRequestMessage<Optional<String>> request,
            @BlobInput(name = "file", dataType = "binary", path = "samples-workitems/{Query.file}") byte[] content,
            @BlobOutput(name = "target", path = "myblob/{Query.file}-CopyViaHttp") OutputBinding<String> outputItem,
            final ExecutionContext context) {
        // Save blob to outputItem
        outputItem.setValue(new String(content, StandardCharsets.UTF_8));

        // build HTTP response with size of requested blob
        return request.createResponseBuilder(HttpStatus.OK)
                .body("The size of \"" + request.getQueryParameters().get("file") + "\" is: " + content.length
                        + " bytes")
                .build();
    }
}
