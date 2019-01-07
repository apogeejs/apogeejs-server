/* 
 * This is a standard format for the handler. It contains a status (implemented 
 * here) and a "process" method, which must be implemented. 
 * On creation, the status is "unknown" and should be updated by the 
 * implementaion. */
class Handler {
    
    /** Constructor. */
    constuctor() {
        //these hold the status
        this.status = Handler.STATUS_UNKOWN;
        this.statusMsg = null;
    }
    
    //---------------------------
    // Status Methods
    //---------------------------
    
    /** This returns the status of the handler. */
    getStatus() {
        return this.status;
    }
    
    /** This returns a status message, which should be set in the case 
     * the status is WorkspaceHandler.STATUS_ERROR. */
    getStatusMsg() {
        return this.statusMsg;
    }
    
    setStatus(status,statusMsg) {
        this.status = status;
        this.statusMsg = statusMsg;
    }
    
    setStatusError(statusMsg) {
        this.status = WorkspaceHandler.STATUS_ERROR;
        this.statusMsg = statusMsg;
    }
    
    //---------------------------
    // Processing Methods
    //---------------------------
    
//    /** This method shoudl be implemented to handle requests. */
//    process(path,queryString,request,response) {}

    //---------------------------
    // Utilities
    //---------------------------
    
    /** This method loads the request body. The callback onData should
     * process the request
     * - onData(request,response,body)
     * If there is a read error, it is handled in this method. It doesn
     * not need to be handled in onData. */
    readBody(request,response,onData) {
        //read the body of the post
        var lines = [];
        request.on('data', function(chunk) {
            lines.push(chunk);
        })
        request.on('end', function() {
            var body = Buffer.concat(lines).toString();
            onData(request,response,body);
        });
        request.on('error', function(err) {
            sendError(500,err,response);
        });
    }
    
    /** This method sends an error response. */
    sendError(code,msg,response) {
        response.writeHead(code, {"Content-Type":"text/plain"});
        response.write(msg);
        response.end();
    }
    
    /** This method checks if the status is not in the ready state. If so it 
     * returns true and sends an error response. If the handler is ready
     * it returns false.
     * This intended usage is in the process method as:
     * if(isHandlerNotReadh(response)) return;
     */
    isHandlerNotReady(response) {
        if(this.status != Handler.STATUS_READY) {
            this.sendError(500,"Server endpoint not ready. Status = " + this.status,response);
            return;
        }
    }
    
    

}

//status values
Handler.STATUS_UNKOWN = "unknown";
Handler.STATUS_NOT_READY = "not ready";
Handler.STATUS_READY = "ready";
Handler.STATUS_ERROR = "error";
Handler.STATUS_SHUTDOWN = "shutdown";

module.exports.Handler = Handler;


