const apogeeutil = require('../apogeejs-util-lib/src/apogeejs-util-lib.js');
const apogee = require('../apogeejs-model-lib/src/apogeejs-model-lib.js');
const doAction = apogee.doAction;
const ModelRunContextLink = apogee.ModelRunContextLink;

/** This is a base class that executes a synchronous or asynchronous action on a model. */
class ActionRunner {
    constructor() {
        this.confirmedModel = null;
        this.onSuccess = null;
        this.onError = null;
        this.modelRunContext = new ServerModelRunContext(this);
    }

    /** This method loads the model from a serialized mode json. */
    async loadModel(modelJson,errorMsgPrefix) {
        let runContextLink = this._createRunContextLinkInstance();
        this.confirmedModel = new apogee.Model(runContextLink);

        let loadAction = {};
        loadAction.action = "loadModel";
        loadAction.modelJson = modelJson;

        //run the load action with invalidOK and the error msg prefix. No output ids for init workspace
        await this.modelManager.runActionOnModel(loadAction,null,true,errorMsgPrefix);
    }

    /** This method sets the base model as a clean copy of the given model. */
    copyModel(model) {
        //Clean makes sure the model is not in the middle of a calculation
        //and cleans it up if so. This shouldn't be.
        let runContextLink = this._createRunContextLinkInstance();
        this.confirmedModel = new apogee.Model(runContextLink,model);
    }

    /** This method returns the latest valid model, such as after completion of the action. 
     * In some error cases, if the action fails to complete, there will not be a valid model and null will be returned.
     * (Most error cases include a valid model - where the model is valid by individual members can have the error state.)
    */
    getModel() {
        return this.confirmedModel;
    }

    /** This method runs an action on the model and then checks the state of the system to check for an error, pending
     * or finished calculation. The action passed in can be null, in which case it immediately checks for completion.
     * The case of no action corresponds to reading static data from the model, with no input.
     * - action - This is the action to run
     * - outputIds - This is a list of ids that should be checked to see if the calculation is complete (as opposed to 
     *      pending). If there is no specific output ids, null (or falsey) can be passed and the root folders for the workspace
     *      will be used to check for calculation completion.
     * - invalidOk - The runner checks the status of the root folders to see if the action is complete. This
     *      flag should be set to true if it is OK that some folders have the state INVAID_VALUE. It will trigger
     *      an error if such a condition is found. Otherwise it will treat this as equivent to the state normal.
     *      We will allow for INVALID_VALUE for the initial base model, but there shold not be INVALID_VALUE after
     *      a request.
     * - errorMsgPrefext - This is used to prefix an error message detected in running the action.
     */
    async runActionOnModel(action,outputIds,invalidOk,errorMsgPrefix) {
        if((this.onSuccess)||(this.onError)) throw new Error("Illegal internal state - action in progress.");

        let actionPromise = new Promise( (resolve,reject) => {
            this.outputIds = outputIds;
            this.onSuccess = () => {
                resolve();
                this._cleanup();
            }
            this.onError = errMsg => {
                reject(errMsg);
                this._cleanup();
            }

            this._runActionOnModelInternal(action,invalidOk,errorMsgPrefix);
        })
        
        return actionPromise;
    }

    //===========================
    // private methods
    //===========================
    _createRunContextLinkInstance() {
        return new ModelRunContextLink(this.modelRunContext);
    }

    /** This should be called internally after an action completes. */
    _cleanup() {
        this.modelRunContext.deactivate();
        this.outputIds = null;
        this.onSuccess = null;
        this.onError = null;
    }

    _runActionOnModelInternal(action,invalidOk,errorMsgPrefix) {
        if((!this.onSuccess)||(!this.onError)) throw new Error("Illegal internal state - action not initialized.");

        let actionResult;
        //execute the action (if applicable)
        if(action) {
            //update the working model instance to run the new command
            let runContextLink = this._createRunContextLinkInstance();
            let mutableModel = this.confirmedModel.getMutableModel(runContextLink);
            actionResult = doAction(mutableModel,action);
        }
        
        //handle error or success
        if((!action)||(actionResult.actionDone)) {
            //accept the new model
            this.confirmedModel = mutableModel;
            runContextLink.setStateValid(true);

            //check if we are finished yet
            //load all root folders and check error state of each
            this._processCompletedAction(mutableModel,invalidOk,errorMsgPrefix);
        }
        else {
            //reject the new model
            this.confirmedMode = null; //discard this for now. We may want to keep the latest godo model.
            runContextLink.setStateValid(false);

            //handle error
            this.onError(errorMsgPrefix + actionResult.errorMsg);
        }
    }

    /** This is used to determine the result of an action, whether it is a completed action,
     * an intermediate action, or an error. */
    _processCompletedAction(mutableModel,invalidOk,errorMsgPrefix) {
        let isPending = false;

        //If there are output ids, determine completion based on those. Otherwise use the root folders.
        let completionCheckIds = this.outputIds ? this.outputIds : this._getRootFolderIds(mutableModel);

        //cycle through completion members (which we need to check to see if the calc is finished)
        completionCheckIds.forEach(memberId => {
            let child = mutableModel.lookupObjectById(memberId);
            let childState = child.getState();
            switch(childState) {
                case apogeeutil.STATE_NORMAL:
                    //maybe finished
                    break;

                case apogeeutil.STATE_ERROR:
                    //error! 
                    let errorMsg = this._getModelErrorMessage(mutableModel);
                    this.onError(errorMsgPrefix + errorMsg);
                    return;

                case apogeeutil.STATE_INVALID:
                    if(!invalidOk) {
                        //if we should not have invalid, flag an error
                        this.onError(errorMsgPrefix + "Unknown error - invalid result");
                        return;
                    }
                    break;

                case apogeeutil.STATE_PENDING:
                    isPending = true;
                    break;
            }
        });

        //if we get here we are either pending or finished
        if(!isPending) {
            //we are finished
            this.onSuccess();
        }
    }

    /** This method loads any errors from within the folder function. 
     * @private  */
     _getModelErrorMessage(model) {
        let memberMap = model.getField("memberMap");
        let errorMessages = [];
        //load error messages from each non-dependency error in the folder function
        for(let id in memberMap) {
            let member = memberMap[id];
            if((member.isMember)&&(member.getState() == apogeeutil.STATE_ERROR)) {
                let error = member.getError();
                if(!error.isDependsOnError) {
                    let errorDesc = error.message ? error.message : error.toString();
                    errorMessages.push(`Member '${member.getName()}': ${errorDesc}`);
                }
            }
        }
        return errorMessages.join("; ");

    }

    _getRootFolderIds(model) {
        let rootFolderIds = [];
        let rootFolderIdMap = model.getChildIdMap();
        for(let childName in rootFolderIdMap) {
            rootFolderIds.push(rootFolderIdMap[childName]);
        }
        return rootFolderIds;
    }
}

module.exports.ActionRunner = ActionRunner;



/** This is the imiplementation of the run context. */
export default class ServerRunContext {
    constructor(actionRunner) {
        this.actionRunner = actionRunner;
    }

    /** This method should return true if the run context is active and false if it has been stopped. For example, if an application
     * is the run context and it has been closed, this should return false.
     */
    getIsActive() {
        return (this.actionRunner) ? true : false; 
    }
    
    deactivate() {
        this.actionRunner = null;
    }

    getConfirmedModel() {
        if(this.actionRunner) {
            return this.actionRunner.getModel();
        }
        else {
            return null;
        }
    }

    futureExecuteAction(modelId,actionData) {
        //if this context instance is not active, ignore command
        if(!this.actionRunner) return;

        //I don't think this should happen, but just in case
        if(this.actionRunner.getModel().getId() != modelId) throw new Error("Invalid model!");

        this.actionRunner._runActionOnModelInternal(actionData,true,"Internal Command:")
    }


};