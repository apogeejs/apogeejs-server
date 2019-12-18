'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

global.__globals__ = global;

/** This namespace contains some basic functions for the application. */
let base$1 = {};

base$1.MEMBER_FUNCTION_INVALID_THROWABLE = {"apogeeException":"invalid"};
base$1.MEMBER_FUNCTION_PENDING_THROWABLE = {"apogeeException":"pending"};

/** This method creates an integer has value for a string. */
base$1.mixin = function(destObject,mixinObject) {
    for(var key in mixinObject) {
        destObject.prototype[key] = mixinObject[key];
    }
};

/** This method takes a field which can be an object, 
 *array or other value. If it is an object or array it 
 *freezes that object and all of its children, recursively.
 * Warning - this does not check for cycles (which are not in JSON 
 * objects but can be in javascript objects)
 * Implementation from Mozilla */
base$1.deepFreeze = function(obj) {
    if((obj === null)||(obj === undefined)) return;
    
    //retrieve the property names defined on obj
    var propNames = Object.getOwnPropertyNames(obj);

    //freeze properties before freezing self
    propNames.forEach(function(name) {
        var prop = obj[name];

        //freeze prop if it is an object
        if(typeof prop == 'object' && prop !== null) base$1.deepFreeze(prop);
    });

    //freeze self (no-op if already frozen)
    return Object.freeze(obj);
};

/** This method creates an error object, which has a "message" in the format
 *of a system error. The isFatal flag can be set to specify if this is a fatal or nonfatal
 *error. It may also be omitted. A base error may also be set. */
base$1.createError = function(msg,optionalIsFatal,optionalBaseError) {
    var error = new Error(msg);
	if(optionalIsFatal !== undefined) {
		error.isFatal = optionalIsFatal;
	}
	if(optionalBaseError !== undefined) {
		error.baseError = optionalBaseError;
	}
    return error;
};

/* 
 * This is a mixin to give event functionality.
 */
var EventManager = {};

/** This serves as the constructor. */
EventManager.init = function() {
     /** This field holds the event listeners
    * @private */
    this.listenerTable = {};
    
    /** This field holds the event handlers
    * @private */
    this.handlerTable = {};
};

/** This method adds a listener for the given event. */
EventManager.addListener = function(eventName, callback) {
    var callbackList = this.listenerTable[eventName];
    if(!callbackList) {
        callbackList = [];
        this.listenerTable[eventName] = callbackList;
    }
    //make sure the object is not already in the list
    for(var i = 0; i < callbackList.length; i++) {
        var c = callbackList[i];
        if(c == callback) {
            return;
        }
    }
    //add to the list
    callbackList.push(callback);
};

/** This method removes a listener for the event. */
EventManager.removeListener = function(eventName, callback) {
    var callbackList = this.listenerTable[eventName];
    if(callbackList) {
        var index = callbackList.indexOf(callback);
        if(index >= 0) {
            callbackList.splice(index,1);
        }
    }
};

/** THis method dispatches an event. */
EventManager.dispatchEvent = function(eventName, eventData) {
    var callbackList = this.listenerTable[eventName];
    if(callbackList) {
        for(var i = 0; i < callbackList.length; i++) {
            var callback = callbackList[i];
            callback.call(null,eventData);
        }
    }
};


/** This method adds a handler. */
EventManager.addHandler = function(handlerName, callback) {
    this.handlerTable[handlerName] = callback;
};

/** This method clears a handler. */
EventManager.removeHandler = function(handlerName) {
    delete this.handlerTable[handlerName];
};

/** This method calls a handler by name and returns the result. If no 
 * handler is found undefined is returned. */
EventManager.callHandler = function(handlerName, handlerData) {
    var callback = this.handlerTable[handlerName];
    if(callback) {
        return callback(handlerData)
    }
    else {
        return undefined;
    }
};

/** This module contains functions to process an update to an member
 * which inherits from the FunctionBase component. */


/** This moethod should be called on an member (impactor or dependent) that changes.
 * This will allow for any Dependents to be recaculated. */
function addToRecalculateList(recalculateList,member) {
    //if it is in the list, return
    if(recalculateList.indexOf(member) >= 0) return;
     
    //add this member to recalculate list if it needs to be executed
    if((member.isDependent)&&(member.needsCalculating())) {
        recalculateList.push(member);
        member.prepareForCalculate();
    }
        
    addDependsOnToRecalculateList(recalculateList,member);
}

function addDependsOnToRecalculateList(recalculateList,member) {
    //add any member that depends on this one    
    var impactsList = member.getImpactsList();
    for(var i = 0; i < impactsList.length; i++) {
        addToRecalculateList(recalculateList,impactsList[i]);
    }
}



/** This calls execute for each member in the recalculate list. The return value
 * is false if there are any errors. */
function callRecalculateList(recalculateList) {
    var dependent;
    var i;
    var success = true;
    for(i = 0; i < recalculateList.length; i++) {
        dependent = recalculateList[i];
        if(dependent.getCalcPending()) {
            dependent.calculate();   
        }
    }
    
    return success;
}

/**
 * Action Module
 * An action is an operation on the data model. The code in this module handles
 * the generic parts of the action process, and the action specific code is placed
 * elsewhere.
 * 
 * Generic Action:
 * - The action is represented by a data object "actionData". 
 * - The method doAction is called to exectue the action.
 * - Available actions are registered through the method addActionInfo.
 *   this allows the doAction method to dispatch the actionData to the proper
 *   action specific code.
 * - Included in doing that action is any updates to dependent tables and the 
 * firing of any events for the changes.
 *   
 * Registering a specific action:
 * To register a specific action, addActionInfo must be called with 
 * a actionInfo object. An action info object is of the following format.
 * actionInfo object: {
 *   "action": (string - this is the name of the action)
 *   "actionFunction": (funtion to exectue object - arguments = actionData,processedActions),
 *   "checkUpdateAll": (boolean - indicates if change in the underlying data model),
 *   "updateDependencies": [Indicates the changed object requires its dependecies be updated),
 *   "addToRecalc": (Indicates the changed object should be added to the recalc list, with its dependencies),
 *   "addDependenceiesToRecalc": (Indicates the changed object should have its dependencies be added to the recalc list, but not itself),
 *   "event": (The name of the event to fire for this object and action.)
 * }
 * 
 * Action Data Format:
 * The action data is used to pass data into the action specific code, and alse to 
 * pass data back from the action specific code. Format:
 * actionData format: {
 *   "action": (The name of the action to execute),
 *   "member": (The data object that is acted upon , if applicable),
 *   (other, multiple): (Specific data for the action),
 *   "onComplete": (OPTIONAL - If this is set it will be called after the action is completed.)
 *   "onAsynchComplete": (OPTIONAL - FOr an asynchronous update, this can be set. It will be
 *   called when the asynch action completes.)
 * }
 * 
 * ActionResult:
 * The return value of the doAction function is an ActionResult struct, with the following data: {
 *   "actionDone": (If this is returned true the action was done. This does not mean it was error free but
 *      it typically does mean the action can be reversed such as with an undo. An example of
 *      where there was an error is if the user is setting code that has a syntax error or that does 
 *      not properly (exectue.)
 *   "actionPending": This flag is returned if the action is a queued action and will be run after the
 *      current action completes.)
 *   "member":
 *   "actionInfo" - (This is the action info associated with the action, mainly used for bookeeping.)
 *   "alertMsg"" (This is a message that should be given to the user. It usually will be sent if there is an error
 *      where actionDone is false, though it may be set on actionDone = true too.)
 *   "isFatal": "If this value is set to true then the application is in an indeterminate state and the user
 *      should not continue."
 *   "childActionResults" - (This is a list of action results if there are additional child actions done with this
 *      action. Examples where this is used are on creating, moving or deleting a folder that has chilren.)
 * }
 * 
 * Action Function:
 * The action function executes the action specific code. It is passed the actionData object
 * and an array "processedActions.". The actions must add any executed actions to the action
 * list. This is done in the action function as opposed to outside because the action
 * function may exectue multiple actions, such as deleting multiple objects.
 * 
 * 
 */ 

/** This structure holds the processing information for all the actions. It is set by each action. 
 * @private */
let actionInfoMap = {
};

/** This method is used to execute an action for the data model. */
function doAction(workspace,actionData) {
    
    var actionResult = {};
    
    //only allow one action at a time
    if(workspace.isActionInProgress()) {
        //this is a messenger action - we will save it and execute it after this computation cycle is complete
        workspace.saveMessengerAction(actionData);
        
        //mark command as pending
        actionResult.actionPending = true;
        return actionResult;
    }
    
    //flag action in progress
    workspace.setActionInProgress(true);
    
    try {   
        
        //do the action
        callActionFunction(workspace,actionData,actionResult); 
        
        //finish processing the action
        var recalculateList = [];
        
        var completedResults = [];
        addToCompletedResultList(completedResults,actionResult);
        
        //handle cases with a valid object 
        updateDependencies(workspace,completedResults,recalculateList);
        
        updateRecalculateList(completedResults,recalculateList);
        
        callRecalculateList(recalculateList);
    
        //fire events
        fireEvents(workspace,completedResults,recalculateList);
	}
	catch(error) {
        if(error.stack) console.error(error.stack);
        
        //unknown application error - this is fatal
        actionResult.actionDone = false;
        actionResult.isFatal = true;
        actionResult.alertMsg = "Unknown error updating model: " + error.message;
        
        workspace.clearCommandQueue();
        workspace.setActionInProgress(false);
        return actionResult;
        
    }
    
    //flag action in progress
    workspace.setActionInProgress(false);
    actionResult.actionDone = true;
    
    //if the action has an onComplete callback, call it here.
    if(actionData.onComplete) {
        actionData.onComplete(actionResult);
    }
    
    //trigger any pending actions
    //these will be done asynchronously
    var savedMessengerAction = workspace.getSavedMessengerAction();
    if(savedMessengerAction) {
        var runQueuedAction = true;

        if(workspace.checkConsecutiveQueuedActionLimitExceeded()) {
            //ask user if about continueing
            var doContinue = confirm("The calculation is taking a long time. Continue?");
            if(!doContinue) {
                workspace.setCalculationCanceled();
                runQueuedAction = false;
            }
        }

        if(runQueuedAction) {
            //FOR NOW WE WILL RUN SYNCHRONOUSLY!!!
            doAction(workspace,savedMessengerAction);
        }
    }
    else {
        workspace.clearConsecutiveQueuedTracking();
    }
    
    //return actionResult
	return actionResult;
}

/** This function is used to register an action. */
function addActionInfo(actionInfo) {
    if(!actionInfo.action) {
        //we hav to ignore this action
        alert("Action name missing from action info: " + JSON.stringify(actionInfo));
        return;
    }
    actionInfoMap[actionInfo.action] = actionInfo;
}

/** This function looks up the proper function for an action and executes it. */
function callActionFunction(workspace,actionData,actionResult) {

    //do the action
    var actionInfo = actionInfoMap[actionData.action];
    if(actionInfo) {
        actionResult.actionInfo = actionInfo;
        actionInfo.actionFunction(workspace,actionData,actionResult);
    }
    else {
        actionResult.actionDone = false;
        actionResult.alertMsg = "Unknown action: " + actionData.action;
    }  
}

//=======================================
// Internal Methods
//=======================================

/** This method makes sure the member dependencies in the workspace are properly updated. 
 * @private */
function updateDependencies(workspace,completedResults,recalculateList) {
    //check if we need to update the entire model
    var updateAllDep = checkUpdateAllDep(completedResults);
    if(updateAllDep) {
        //update entire model - see conditions bewlo
        workspace.updateDependeciesForModelChange(recalculateList);
    }
    else {
        //upate dependencies on table with updated code
        for(var i = 0; i < completedResults.length; i++) {
            var actionResult = completedResults[i];
            if((actionResult.actionDone)&&(actionResult.member)) {
                if(doInitializeDependencies(actionResult)) {
                    actionResult.member.initializeDependencies();
                }
            }
        }
    }
}
    
/** This function updates the recalculation list for the given processed actions. 
 * @private */
function updateRecalculateList(completedResults,recalculateList) {
    for(var i = 0; i < completedResults.length; i++) {
        var actionResult = completedResults[i];
        if((actionResult.actionDone)&&(actionResult.member)) {
            if(doAddToRecalc(actionResult)) {
                addToRecalculateList(recalculateList,actionResult.member);            
            }
            else if((doAddDependOnToRecalc(actionResult))) {
                addDependsOnToRecalculateList(recalculateList,actionResult.member);                         
            }
        }
    }
}
    
/** This function fires the proper events for the  It combines events to 
 * fire a single event for each member.
 * @private */
function fireEvents(workspace,completedResults,recalculateList) {

    var eventMap = {};
    var member;
    
    //go through explicitly called events from results
    for(var i = 0; i < completedResults.length; i++) {
        var actionResult = completedResults[i];
        var actionInfo = actionResult.actionInfo;
        
        if(actionInfo) {
            
            let eventName = actionInfo.event;
            if(!eventName) continue;
            
            let member = actionResult.member;
            
            mergeEventIntoEventMap(eventMap,member,eventName);
        }
    }
    
    //add an update event for any object not accounted from
    for(i = 0; i < recalculateList.length; i++) {
        var member = recalculateList[i];
        mergeEventIntoEventMap(eventMap,member,"memberUpdated");
    } 
    
    //fire events from the event map
    for(var idString in eventMap) {
        let eventInfo = eventMap[idString];
        workspace.dispatchEvent(eventInfo.event,eventInfo);
        //clear the update map for this member (the member should be set
        if(eventInfo.member) {
            eventInfo.member.clearUpdated();
        }
        else {
            console.log("Error: Member not set for event: " + eventInfo.event);
        }
    }
}

/** This is a helper function to dispatch an event. */
function mergeEventIntoEventMap(eventMap,member,eventName) {
    
    //############################################
    //OOPS - my current logic does nto allow for non-member events. 
    //for now I will dump them. i need to add them back.
    if(!member) return;
    //############################################
    
    var memberId = member.getId();
     
    var existingInfo = eventMap[memberId];
    var newInfo;
     
    if(existingInfo) {
        if((existingInfo.event == eventName)) {
            //repeat event - including case of both being "memberUpdated"
            newInfo = existingInfo;
        }
        else if((existingInfo.event == "memberDeleted")||(eventName == "memberDeleted")) {
            newInfo =  { member: member, event: "memberDeleted" };
        }
        else if((existingInfo.event == "memberCreated")||(eventName == "memberCreated")) {
            newInfo =  { member: member, updated: member.getUpdated(), event: "memberCreated" };
        }
        else {
            //we this shouldn't happen - it means we hace an unknown event type
            throw new Error("Unknown event type: " + existingInfo.event + ", " + eventName);
        }
    }
    else {
        //create event object - note we don't need the "updated" field on a delete event, but that is ok
        newInfo =  { member: member, updated: member.getUpdated(), event: eventName };
    }
     
    eventMap[memberId] = newInfo; 
}

/** This method determines if updating all dependencies is necessary. Our dependency 
 * tracking may be in error if a new member is created, a member is deleted or
 * a member is moved. In these actions we flag that the entire model should be
 * updated.*/
function checkUpdateAllDep(completedResults) {
    for(var i = 0; i < completedResults.length; i++) {
        var actionResult = completedResults[i];
        
        //we need to update the entire model if any actino is flagged as such
        if(actionResult.member) {
            var actionInfo = actionResult.actionInfo;
            if((actionInfo)&&(actionInfo.checkUpdateAll)){
                return true;
            }
        }
    }
    return false;
}

/** This method if a single action entry requires updating dependencies for the associated member. */
function doInitializeDependencies(actionResult) {
    if(!actionResult.member) return false;
    
    //only applicable to codeables
    if((actionResult.actionInfo)&&(actionResult.member.isCodeable)) {
        return actionResult.actionInfo.updateDependencies;
    }
    else {
        return false;
    }
}

/** This method checks if the associated member and its dependencies need to be added to the recalc list. */
function doAddToRecalc(actionResult) {
    if(!actionResult.member) return false;
    if(!actionResult.member.isDependent) return false;
    
    if(actionResult.actionInfo) {
        return actionResult.actionInfo.addToRecalc;
    }
    else {
        return false;
    }
}

/** This method checks if the dependencies of the associated needs to be added to the recalc list, but not the member itself. */
function doAddDependOnToRecalc(actionResult) {
    if(actionResult.actionInfo) {
        return actionResult.actionInfo.addDependenceiesToRecalc;
    }
    else {
        return false;
    }
}

/** This method unpacks the actionResult and its child reponse into an array of actionResult. */
function addToCompletedResultList(completedResults,actionResult) {
    completedResults.push(actionResult);
    if(actionResult.childActionResults) {
        for(var key in actionResult.childActionResults) {
            addToCompletedResultList(completedResults,actionResult.childActionResults[key]);
        }      
    }
}

//============================================
// Compound Action
//============================================

/** The compound action is automatically imported when the action module is imported.
 *
 * Action Data format:
 * {
 *  "action": "compoundAction",
 *  "actions": (list of actions in this compound action),
 * }
 */


/** This method is the action function for a compound action. */
function compoundActionFunction(workspace,actionData,actionResult) {

    var actionList = actionData.actions;
    actionResult.childActionResults = [];
    for(var i = 0; i < actionList.length; i++) {
        let childActionData = actionList[i];
        let childActionResult = {};
        callActionFunction(workspace,childActionData,childActionResult);
        actionResult.childActionResults.push(childActionResult);   
    }
    actionResult.actionDone = true;
}

/** Action info */
let COMPOUND_ACTION_INFO = {
    "action": "compoundAction",
    "actionFunction": compoundActionFunction,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": false,
    "event": null
};


//This line of code registers the action 
addActionInfo(COMPOUND_ACTION_INFO);

/** This class manages context for the user code. It is used to look up 
 * variables from the scope defined by the context. 
 * It contains a context list, that allows for a number of entries. There are two
 * types of entries, "parent" entries and "data" entries.
 * A "parent" entry is an sopogee parent, which contains apogee members. From the "parent" entry 
 * you can lookup either a member object (getMember) or a member object value (getValue)
 * A "data" entry is a map of variables. Thse are not apogee members. With a "data" entry 
 * you can look up the variable values only. This is used to give access to other
 * variables besides the apogee members. */
function ContextManager(contextHolder) {
    this.contextHolder = contextHolder;
    this.contextList = [];
}

ContextManager.prototype.addToContextList = function(entry) {
    this.contextList.push(entry);
};

ContextManager.prototype.removeFromContextList = function(entry) {
    var index = this.contextList.indexOf(entry);
    if(index >= 0) {
        this.contextList.splice(index,1);
    }
};

ContextManager.prototype.clearContextList = function() {
    this.contextList = [];
};

ContextManager.prototype.getValue = function(varName) {
    var data = this.lookupValue(varName);
    
    //if the name is not in this context, check with the parent context
    if(data === undefined) {
        if((this.contextHolder)&&(this.contextHolder.getOwner)) {
            var owner = this.contextHolder.getOwner();
            if(owner) {
                var ownerContextManager = owner.getContextManager();
                data = ownerContextManager.getValue(varName);
            }
        }
    }
    
    return data;
};

ContextManager.prototype.getMember = function(path) {
    var impactor = this.lookupMember(path);
    
    //if the object is not in this context, check with the parent context
    if(impactor === undefined) {
        if((this.contextHolder)&&(this.contextHolder.getOwner)) {
            var owner = this.contextHolder.getOwner();
            if(owner) {
                var ownerContextManager = owner.getContextManager();
                impactor = ownerContextManager.getMember(path);
            }
        }
    }
    
    return impactor;
};

//==================================
// Private Methods
//==================================

/** Check each entry of the context list to see if the data is present. */
ContextManager.prototype.lookupValue = function(varName) {
    var data;
    for(var i = 0; i < this.contextList.length; i++) {
        var entry = this.contextList[i];        
        if(entry.parent) {
            //for parent entries, look up the child and read the data
            var child = entry.parent.lookupChild(varName);
            if(child) {
                data = child.getData();
            }
        }
        else if(entry.data) {
            //for data entries, look up the value from the data map
            data = entry.data[varName];
        }
        
        if(data !== undefined) return data;
    }
    
    return undefined;
};

ContextManager.prototype.lookupMember = function(path) {
    var impactor;
    for(var i = 0; i < this.contextList.length; i++) {
        var entry = this.contextList[i];        
        if(entry.parent) {
            //for parent entries, look up the child and read the data
            impactor = entry.parent.lookupChildFromPathArray(path);
        }
        //no lookup in data entries
        
        if(impactor !== undefined) return impactor;
    }
    
    return undefined;
};

/** This component encapsulates an object that has a context manager.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 */
let ContextHolder = {};
/** This initializes the component */
ContextHolder.init = function() {
    //will be set on demand
    this.contextManager = null;
};

ContextHolder.isContextHolder = true;

/** This method retrieves the context manager. */
ContextHolder.getContextManager = function() {
    if(!this.contextManager) {
        //set the context manager
        this.contextManager = this.createContextManager();
    }
    
    return this.contextManager;
};

//this method must be implemneted in extending classes
///** This method retrieve creates the loaded context manager. */
//ContextHolder.createContextManager = function();

/** This component encapsulates an object that owns a member. This is different from
 * Parent in that Parent is also a member. Parents are a subset of owners.
 * An object that owns a root folder is an owner but not a parent.
 * Examples of Owners that are not parent are the Workspace, which holds the workspace root folder
 * and the FolderFunction, which is a data object which has its own root folder containing its children,
 * which are inaccessible from the rest of the workspace.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * An Owner must be a Context Holder
 */
let Owner = {};
/** This initializes the component */
Owner.init = function() {
};

Owner.isOwner = true;

//must be implemented in extending object
///** This method retrieves the workspace for the child of this owner. */
//Owner.getWorkspace = function();

//must be implemented in extending object
///** This method retrieves the full name whichis relevent for a root folder owned
// * by this object. */
//Owner.getPossesionNameBase = function();

/** This method returns the full name in dot notation for this object. */
Owner.getChildFullName = function(childName) {
    return this.getPossesionNameBase() + childName;
};

//must be implented by extending object
///** This method retrieves the context manager for this owner. */
//Owner.getContextManager = function();

/** This method looks up a member by its full name. */
Owner.getMemberByFullName = function(fullName) {
    var path = fullName.split(".");
    return this.getMemberByPathArray(path);
};

///** This method looks up a member by an array path. The start element is
// * the index of the array at which to start. */
//Owner.getMemberByPathArray = function(path,startElement);

///** This method is called when the workspace is closed.
// It should do any needed cleanup for the object. */
//Owner.onClose = function();

/** This component encapsulates an owner object which is not a member and it contains a single child (usually a folder) which
 * is the "root" object for a hierarchy.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A RootHolder must be an Owner.
 */
let RootHolder = {};
/** This initializes the component */
RootHolder.init = function() {
};

RootHolder.isRootHolder = true;

// Must be implemented in extending object
///** This method sets the root object.  */
//RootHolder.setRoot = function(member);

// Must be implemented in extending object
///** This method returns the root object.  */
//RootHolder.getRoot = function();

/** This is the workspace. Typically owner should be null. It
 * is used for creating virtual workspaces. 
 * - optionalJson - For new workspaces this can be empty. If we are deserializing an existing
 * workspace, the json for it goes here.
 * - optionalContextOwner - This is used if the workspace should be placed in a context. This is 
 * used for the virtual workspace created for folder functions, so the folder function can 
 * access variables from the larger workspace.
 * */
function Workspace(optionalContextOwner) {
    //base init
    EventManager.init.call(this);
    ContextHolder.init.call(this);
    Owner.init.call(this);
    RootHolder.init.call(this);
    
    // This is a queue to hold actions while one is in process.
    this.actionInProgress = false;
    this.messengerActionList = [];
    this.consecutiveActionCount = 0;
    this.activeConsecutiveActionLimit = Workspace.CONSECUTIVE_ACTION_INITIAL_LIMIT;
    this.name = Workspace.DEFAULT_WORKSPACE_NAME;
    
    this.owner = optionalContextOwner ? optionalContextOwner : null;
}

//add components to this class
base$1.mixin(Workspace,EventManager);
base$1.mixin(Workspace,ContextHolder);
base$1.mixin(Workspace,Owner);
base$1.mixin(Workspace,RootHolder);


Workspace.DEFAULT_WORKSPACE_NAME = "Workspace";
Workspace.ROOT_FOLDER_NAME = "Model";

Workspace.CONSECUTIVE_ACTION_INITIAL_LIMIT = 500;

Workspace.EMPTY_WORKSPACE_JSON = {
    "fileType": "apogee workspace",
    "version": 0.2,
    "name": "Workspace",
    "data": {
        "name": "Model",
        "type": "apogee.Folder"
    }
};

/** This method returns the root object - implemented from RootHolder.  */
Workspace.prototype.setName = function(name) {
    this.name = name;
};

/** This method returns the root object - implemented from RootHolder.  */
Workspace.prototype.getName = function() {
    return this.name;
};

/** This method returns the root object - implemented from RootHolder.  */
Workspace.prototype.getRoot = function() {
    return this.rootFolder;
};

/** This method sets the root object - implemented from RootHolder.  */
Workspace.prototype.setRoot = function(member) {
    this.rootFolder = member;
};

/** This allows for a workspace to have a parent. For a normal workspace this should be null. 
 * This is used for finding variables in scope. */
Workspace.prototype.getOwner = function() {
    return this.owner;
};

/** This method updates the dependencies of any children in the workspace. */
Workspace.prototype.updateDependeciesForModelChange = function(recalculateList) {
    if(this.rootFolder) {
        this.rootFolder.updateDependeciesForModelChange(recalculateList);
    }
};

/** This method removes any data from this workspace on closing. */
Workspace.prototype.onClose = function() {
    this.rootFolder.onClose();
};

//------------------------------
// Queded Action Methods
//------------------------------

/** This function triggers the action for the queued action to be run when the current thread exits. */
Workspace.prototype.isActionInProgress = function() {
    return this.actionInProgress;
};

Workspace.prototype.setActionInProgress = function(inProgress) {
    this.actionInProgress = inProgress;
};

Workspace.prototype.saveMessengerAction = function(actionInfo) {
    this.messengerActionList.push(actionInfo);
};

Workspace.prototype.getSavedMessengerAction = function() {
    if(this.messengerActionList.length > 0) {
        var actionData = {};
        actionData.action = "compoundAction";
        actionData.actions = this.messengerActionList;
        this.messengerActionList = [];
        return actionData;
    }
    else {
        return null;
    }
};

/** This method should be called for each consecutive queued action. It checks it if there are 
 * too many. If so, it returns true. In so doing, it also backs of the consecutive queued 
 * action count so next time it will take longer. Any call to clearConsecutiveQueuedActionCount
 * will return it to the default initial value.
 */
Workspace.prototype.checkConsecutiveQueuedActionLimitExceeded = function() {
    this.consecutiveActionCount++;
    
    //check the limit
    var exceedsLimit = (this.consecutiveActionCount > this.activeConsecutiveActionLimit);
    if(exceedsLimit) {
        //back off limit for next time
        this.activeConsecutiveActionLimit *= 2;
    }
    
    return exceedsLimit;
};

/** This should be called wo abort any queued actions. */
Workspace.prototype.setCalculationCanceled = function() {
    //reset queued action variables
    this.clearCommandQueue();
    
    alert("The tables are left in improper state because the calculation was aborted. :( ");
};

/** This should be called when there is not a queued action. */
Workspace.prototype.clearConsecutiveQueuedTracking = function() {
    this.consecutiveActionCount = 0;
    this.activeConsecutiveActionLimit = Workspace.CONSECUTIVE_ACTION_INITIAL_LIMIT;
};

/** This method resets the command queue */
Workspace.prototype.clearCommandQueue = function() {
    //reset queued action variables
    this.messengerActionList = [];
    this.clearConsecutiveQueuedTracking();
};


//------------------------------
// Owner Methods
//------------------------------

/** this method is implemented for the Owner component/mixin. */
Workspace.prototype.getWorkspace = function() {
   return this;
};

/** this method gets the hame the children inherit for the full name. */
Workspace.prototype.getPossesionNameBase = function() {
    //the name starts over at a new workspace
    return "";
};

/** This method looks up a member by its full name. */
Workspace.prototype.getMemberByPathArray = function(path,startElement) {
    if(startElement === undefined) startElement = 0;
    if(path[startElement] === this.rootFolder.getName()) {
        if(startElement === path.length-1) {
            return this.rootFolder;
        }
        else {
            startElement++;
            return this.rootFolder.lookupChildFromPathArray(path,startElement);
        }
    }
    else {
        return null;
    }
};

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
Workspace.prototype.createContextManager = function() {
    //set the context manager
    var contextManager = new ContextManager(this);
    
    //if no owner is defined for the workspace - the standard scenario, we will
    //add all global variables as a data entry for the context, so these variables
    //can be called from the workspace. 
    if(!this.owner) {
        var globalVarEntry = {};
        globalVarEntry.data = __globals__;
        contextManager.addToContextList(globalVarEntry);
    }
    //if there is an owner defined, the context manager for the owner will be used
    //to lokoup variables. This is done for a folder function, so that it has
    //access to other variables in the workspace.
    
    return contextManager;
};

//============================
// Save Functions
//============================

/** This is the supported file type. */
Workspace.SAVE_FILE_TYPE = "apogee workspace";

/** This is the supported file version. */
Workspace.SAVE_FILE_VERSION = 0.2;

/** This method creates a headless workspace json from a folder json. It
 * is used in the folder function. */
Workspace.createWorkpaceJsonFromFolderJson = function(name,folderJson) {
	//create a workspace json from the root folder json
	var workspaceJson = {};
    workspaceJson.fileType = Workspace.SAVE_FILE_TYPE;
    workspaceJson.version = Workspace.SAVE_FILE_VERSION;
    workspaceJson.name = name;
    workspaceJson.data = folderJson;
	return workspaceJson;
};

/** This saves the workspace */
Workspace.prototype.toJson = function() {
    var rootFolderJson = this.rootFolder.toJson();
    return Workspace.createWorkpaceJsonFromFolderJson(this.name,rootFolderJson);
};

/** This is loads data from the given json into this workspace. */
Workspace.prototype.loadFromJson = function(json) {
    var fileType = json.fileType;
	if(fileType !== Workspace.SAVE_FILE_TYPE) {
		throw base$1.createError("Bad file format.",false);
	}
    if(json.version !== Workspace.SAVE_FILE_VERSION) {
        throw base$1.createError("Incorrect file version. CHECK APOGEEJS.COM FOR VERSION CONVERTER.",false);
    }

    if(json.name !== undefined) {
        this.name = json.name;
    }

    var actionData = {};
    actionData.action = "createMember";
    actionData.workspaceIsOwner = true;
    actionData.createData = json.data;
    var actionResult = doAction(this,actionData);
    
    return actionResult;
};

//================================
// Member generator functions
//================================

Workspace.memberGenerators = {};

/** This methods retrieves the member generator for the given type. */
Workspace.getMemberGenerator = function(type) {
    return Workspace.memberGenerators[type];
};

/** This method registers the member generator for a given named type. */
Workspace.addMemberGenerator = function(generator) {
    Workspace.memberGenerators[generator.type] = generator;
};

/** This method class is an action error object, to be used in an action return value. 
 * The error type is a classification string. If the error is associated with a member
 * the member can be set here. */
function ActionError(msg,errorType,optionalMember) {
    this.msg = (msg != null) ? msg : ActionError.UNKNOWN_ERROR_MESSAGE;
    this.errorType = errorType;
    this.member = optionalMember;
    
    this.isFatal = false;
    this.parentException = null;
}

/* Error type Application - This is an error caused by the application. This is
 * may be shown to the user in a dialog. */
ActionError.ERROR_TYPE_APP = "AppException";
/** Error Type Model - This is an error that arises from the user code. Note that
 * rather than using this error type, a alternate descriptive string may be used. */
ActionError.ERROR_TYPE_MODEL = "ModelException";
/** Error Type User - this is operator error. */
ActionError.ERROR_TYPE_USER = "UserException";

/** This is used as the error message when no other error message is given. */
ActionError.UNKNOWN_ERROR_MESSAGE = "Unknown Error";


/** This sets the exception that triggered this error. */
ActionError.prototype.setParentException = function(exception) {
    this.parentException = exception;
};

/** This sets the exception that triggered this error. */
ActionError.prototype.setIsFatal= function(isFatal) {
    this.isFatal = isFatal;
};

/** This returns true if this is a fatal error. */
ActionError.prototype.getIsFatal= function() {
    return this.isFatal;
};

/** This gets the type of error. */
ActionError.prototype.getType= function() {
    return this.errorType;
};

/** This method processes a fatal application exception, returning an ActionError object
 * marked as fatal. This should be use when the app lication is left in an unknown state. 
 * The resulting error message is the message from the
 * exception. An optional prefix may be added using the argument optionalErrorMsgPrefix.
 * This method also prints the stack trace for the exception. */
ActionError.processException = function(exception,type,defaultToFatal,optionalErrorMsgPrefix) {  
    if(exception.stack) {
        console.error(exception.stack);
    }
    var errorMsg = optionalErrorMsgPrefix ? optionalErrorMsgPrefix : "";
    if(exception.message) errorMsg += exception.message;
    if(errorMsg.length == 0) errorMsg = "Unknown error";
    var actionError = new ActionError(errorMsg,type,null);
    actionError.setParentException(exception);
	
    var isFatal;
	if(exception.isFatal !== undefined) {
		isFatal = exception.isFatal;
	}
	else {
		isFatal = defaultToFatal;
	}
	
    actionError.setIsFatal(isFatal);
    return actionError;
};

ActionError.getListErrorMsg = function(errorList) {
    var msgList = errorList.map( actionError => {
        var msg = "";
        if(actionError.member) {
            msg += actionError.member.getName() + ": ";
        }
        msg += actionError.msg;
        return msg;
    });
    return msgList.join(";\n");
};

/** This is self installing command module. It has no exports
 * but it must be imported to install the command. 
 *
 * Action Data format:
 * {
 *  "action": "createMember",
 *  "owner": (parent/owner for new member),
 *  "name": (name of the new member),
 *  "createData": 
 *      - name
 *      - unique table type name
 *      - additional table specific data
 *  
 * }
 *
 * MEMBER CREATED EVENT: "memberCreated"
 * Event member format:
 * {
 *  "member": (member)
 * }
 */


/** This method instantiates a member, without setting the update data. 
 *@private */
function createMember(workspace,actionData,processedActions,actionResult) {
    
    var owner;
    if(actionData.workspaceIsOwner) {
        owner = workspace;
    }
    else {
        var ownerFullName = actionData.ownerName;
        var owner = workspace.getMemberByFullName(ownerFullName);
        if(!owner) {
            actionResult.actionDone = false;
            actionResult.alertMsg = "Parent not found for created member";
            return;
        }
    }
 
    createMemberImpl(owner,actionData,processedActions,actionResult);
}
 
    
function createMemberImpl(owner,actionData,actionResult) {
    
    var memberJson = actionData.createData;
    var member;
     
    //create member
    var generator;
    if(memberJson) {
        generator = Workspace.getMemberGenerator(memberJson.type);
    }

    if(generator) {
        member = generator.createMember(owner,memberJson);   

        //instantiate children if there are any
        if(memberJson.children) {
            actionResult.childActionResults = {};
            for(var childName in memberJson.children) {
                var childActionData = {};
                childActionData.action = "createMember";
                childActionData.createData = memberJson.children[childName];
                var childActionResult = {};
                childActionResult.actionInfo = ACTION_INFO;
                createMemberImpl(member,childActionData,childActionResult);
                actionResult.childActionResults[childName] = childActionResult;
            }
        }
    }
    else {
        //type not found! - create a dummy object and add an error to it
        var errorTableGenerator = Workspace.getMemberGenerator("appogee.ErrorTable");
        member = errorTableGenerator.createMember(owner,memberJson);
        var error = new ActionError("Member type not found: " + memberJson.type,ActionError.ERROR_TYPE_APP,null);
        member.addError(error);
        
        //store an error message, but this still counts as command done.
        actionResult.alertMsg = "Error creating member: member type not found: " + memberJson.type;
    }

    actionResult.member = member;
    actionResult.actionDone = true;
}

/** Action info */
let ACTION_INFO = {
    "action": "createMember",
    "actionFunction": createMember,
    "checkUpdateAll": true,
    "updateDependencies": true,
    "addToRecalc": true,
    "event": "memberCreated"
};

//This line of code registers the action 
addActionInfo(ACTION_INFO);

/** 
 * This namespace includes some utility functions available to the user.
 * @namespace
 */
let util = {};

/** 
 * This value can be assigned to a data table to signify that data is not valid.
 * Any other member depending on this value will withhold the calcalation and also
 * return this invalid value.
 */
util.INVALID_VALUE = {"apogeeValue":"INVALID VALUE"};

/** 
 * This function should be called from the body of a function table
 * to indicate the function will not return a valid value. (The actual invalid value
 * can not be returned since this typically will not have the desired effect.)
 */
util.invalidFunctionReturn = function() {
    throw base.MEMBER_FUNCTION_INVALID_THROWABLE;
};

/** 
 * This method creates an integer hash value for a string. 
 * 
 * @param {String} string - This is the string for which a hash number is desired.
 * @return {integer} This is the hash value for the string.
 */
util.stringHash = function(string) {
    var HASH_SIZE = 0xffffffff;
    var hash = 0;
    var ch;
    for (var i = 0; i < string.length; i++) {
        ch = string.charCodeAt(i);
        hash = (31 * hash + ch) & HASH_SIZE;
    }
    return hash;
};

/** 
 * This method creates an integer hash value for a JSON object. 
 * 
 * @param {JSON} object - This is the json valued object for which a hash number is desired.
 * @return {integer} This is the hash value for the JSON.
 */
util.objectHash = function(object) {
    //this is not real efficient. It should be implemented differently
    var string = JSON.stringify(object);
    return stringHash(string);
};

/**
 * @private
 */
util.constructors = {
    "String": ("").constructor,
    "Number": (3).constructor,
    "Boolean": (true).constructor,
    "Date": (new Date()).constructor,
    "Object": ({}).constructor,
    "Array": ([]).constructor,
    "Function": (function(){}).constructor
};

/** This method returns the object type. The Allowed types are:
 * String, Number, Boolean, Date, Object, Array, Function, null, undefined.
 * @param {Object} object - This is the object for which the type is desired.
 * @returns {String} This is the type for the object. 
 */
util.getObjectType = function(object) {
    if(object === null) return "null";
    if(object === undefined) return "undefined";
    
    var constructor = object.constructor;
    for(var key in util.constructors) {
        if(constructor == util.constructors[key]) {
            return key;
        }	
    }
    //not found
    return "Unknown";
};

/** This method creates a deep copy of an object, array or value. Note that
 * undefined is not a valid value in JSON. 
 * 
 * @param {JSON} data - This is a JSON valued object
 * @returns {JSON} A JSON object which is a deep copy of the input.
 */
util.jsonCopy = function(data) {
    if(data === null) return null;
    if(data === undefined) return undefined;
    return JSON.parse(JSON.stringify(data));
};

/** This method does format string functionality. Text should include
 * {i} to insert the ith string argument passed. 
 *  @param {String} format - This is a format string to format the output.
 *  @param {Array} stringArgs - These are the values which should be placed into the format string.
 *  @returns {String} The format string with the proper inserted values is returned.  
 */
util.formatString = function(format,stringArgs) {
    var formatParams = arguments;
    return format.replace(/{(\d+)}/g, function(match,p1) {
        var index = Number(p1) + 1;
        return formatParams[index]; 
    });
};

/** This method reads the query string from a url
 * 
 *  @param {String} field - This is the field that should be read from the url query string
 *  @param {String} url - This is the url from which we read the query string
 *  @returns {String} The value associated with the query string key passed in. 
 */
util.readQueryField = function(field,url) {
    var href = url ? url : window.location.href;
    var reg = new RegExp( '[?&]' + field + '=([^&#]*)', 'i' );
    var string = reg.exec(href);
    return string ? string[1] : null;
};

/** 
 * This is a not-so-efficient equals for json objects. For JSON objects it
 * does not require order matching of the keys. For JSON arrays it does require
 * order matching of the array values.
 * 
 *  @param {JSON} json1 - This is a JSON valued object 
 *  @param {JSON} json1 - This is a JSON valued object 
 *  @returns {Boolean}  - Returns whether or not the objects are equal
 */
util.jsonEquals = function(json1,json2) {
    var string1 = JSON.stringify(util.getNormalizedCopy(json1));
    var string2 = JSON.stringify(util.getNormalizedCopy(json2));
    return (string1 == string2);
};

/** 
 * This method returns a copied json that has the order in all JSON objects/"maps" normalized to alphabetical. 
 * The order of JSON arrays is NOT modified.
 * This is intended for the purpose of comparing json objects. 
 * 
 *  @param {JSON} json1 - This is a JSON valued object 
 *  @returns {Boolean}  - Returns whether or not the objects are equal
 */  
util.getNormalizedCopy = function(json) {
    var copiedJson;

    var objectType = util.getObjectType(json);
    
    switch(objectType) {
        case "Object":
            copiedJson = util.getNormalizedObjectCopy(json);
            break;
            
        case "Array": 
            copiedJson = util.getNormalizedArrayCopy(json);
            break;
            
        default:
            copiedJson = json;
    }
    
    return copiedJson;
};

/** this orders the keys apphabetically, since order is not important in a json object 
 * @private
 */
util.getNormalizedObjectCopy = function(json) {
    var copiedJson = {};
    
    var keys = [];
    var key;
    for(key in json) {
        keys.push(key);
    }
    
    keys.sort();
    
    for(var i = 0; i < keys.length; i++) {
        key = keys[i];
        copiedJson[key] = util.getNormalizedCopy(json[key]);
    }
    return copiedJson;
};

/** This method counts the properties in a object. */
util.jsonObjectLength = function(jsonObject) {
    var count = 0;

    for(var key in jsonObject) {
        count++;
    }

    return count;
};

/** This makes a copy of with any contained objects normalized. 
 * @private 
 */
util.getNormalizedArrayCopy = function(json) {
    var copiedJson = [];
    for(var i = 0; i < json.length; i++) {
        var element = json[i];
        copiedJson.push(util.getNormalizedCopy(element));
    }
    return copiedJson;
};

//=============================
// Field Update Info Methods
//=============================

/** This constant is used to field update info, to specify all fields are updated. */
util.ALL_FIELDS = "all";

/** This method takes a field update Info object (a set or map of names to a truthy value)
 * and either a single field name or an arrya of field names. In the case of a single
 * field name passed, it returns true if that field has been updated. In the case
 * of an array of field names, it checks if any of those fields have been updated.
 * The field update info object may have the value "all" set to true. In this case
 * any test against it will return true. */
util.isFieldUpdated = function(updateInfo,fieldOrFields) {
    if(updateInfo[util.ALL_FIELDS]) return true;
    if(Array.isArray(fieldOrFields)) {
        return fieldOrFields.any(fieldName => updateInfo[fieldName]);
    }
    else {
        if(updateInfo[fieldOrFields]) return true;
        else return false;
    }
    
};

/** This method returns a field update object for the given member that returns 
 * true for all fields checked. The event name can optionally be passed in.
 * Otherwise the event name will be set to "all".*/
util.getAllFieldsInfo = function(member,optionalEventName) {
    let updateInfo = {};
    updateInfo.member = member;
    updateInfo.updated = {};
    updateInfo.updated[util.ALL_FIELDS] = true;
    updateInfo.event = optionalEventName ? optionalEventName : "all";
    return updateInfo;
};

//=================
// Some other generic utils
//=================

/** This methdo parses an arg list string to make an arg list array. It is
 * also used outisde this class. */
util.parseStringArray = function(argListString) {
    var argList = argListString.split(",");
    for(var i = 0; i < argList.length; i++) {
        argList[i] = argList[i].trim();
    }
    return argList;
};

/** This is self installing command module. It has no exports
 * but it must be imported to install the command. 
 *
 * Action Data format:
 * {
 *  "action": "updateData",
 *  "memberName": (member to update),
 *  "data": (new value for the table)
 *  "sourcePromise": (OPTIONAL - If this is the completion of an asynchronous action, the
 *      source promise shoudl be included to make sure it has not been overwritten with a
 *      more recent operation.)
 *  "promiseRefresh": (OPTIONAL - If this action reinstates a previously set promise,
 *      this flag will prevent setting additional then/catch statements on the promise)
 * }
 * 
 * Action Data format:
 * {
 *  "action": "updateCode",
 *  "memberName": (member to update),
 *  "argList": (arg list for the table)
 *  "functionBody": (function body for the table)
 *  "supplementalCode": (supplemental code for the table)
 * }
 */


/** Update description action name - used for publishing an error after an asynchronous formula
 * Action Data format:
 * {
 *  "action": "updateDescription",
 *  "member": (member to update),
 *  "description": (description)
 * }
 */


/** member UPDATED EVENT: "memberUpdated"
 * Event member format:
 * {
 *  "member": (member)
 * }
 */


/** Update code action function. */
function updateCode(workspace,actionData,actionResult) {
    
    var memberFullName = actionData.memberName;
    var member = workspace.getMemberByFullName(memberFullName);
    if(!member) {
        actionResult.actionDone = false;
        actionResult.errorMsg = "Member not found for update member code";
        return;
    }
    actionResult.member = member;

    if((!member.isCodeable)||(!member.getSetCodeOk())) {
        actionResult.actionDone = false;
        actionResult.errorMsg = "can not set code on member: " + member.getFullName();
        return;
    }
          
    member.applyCode(actionData.argList,
        actionData.functionBody,
        actionData.supplementalCode);
        
    
    actionResult.actionDone = true;
}

/** Update data action function. */
function updateData(workspace,actionData,actionResult) {
    
    var memberFullName = actionData.memberName;
    var member = workspace.getMemberByFullName(memberFullName);
    if(!member) {
        actionResult.actionDone = false;
        actionResult.errorMsg = "Member not found for update member data";
        return;
    }
    actionResult.member = member;
    
    if(!member.getSetDataOk()) {
        actionResult.actionDone = false;
        actionResult.errorMsg = "Can not set data on member: " + memberFullName;
        return;
    }
        
    var data = actionData.data;
    
    //if this is the resolution (or rejection) of a previously set promise
    if(actionData.sourcePromise) {
        if(member.pendingPromiseMatches(actionData.sourcePromise)) {
            //this is the reoslution of pending data
            member.setResultPending(false);
        }
        else {
            //no action - this is from an asynch action that has been overwritten
            actionResult.actionDone = false;
            return;
        }
    }
    
    //some cleanup for new data
    member.clearErrors();
    if((member.isCodeable)&&(actionData.sourcePromise === undefined)) {
        //clear the code - so the data is used
        //UNLESS this is a delayed set date from a promise, in what case we want to keep the code.
        member.clearCode();
    }
    
    //handle four types of data inputs
    if(data instanceof Promise) {
        //data is a promise - will be updated asynchromously
        
        //check if this is only a refresh
        var optionalPromiseRefresh = actionData.promiseRefresh ? true : false;
        
        member.applyPromiseData(data,actionData.onAsynchComplete,optionalPromiseRefresh);
    }
    else if(data instanceof Error) {
        //data is an error
        var actionError = ActionError.processException(data,ActionError.ERROR_TYPE_MODEL);
        member.addError(actionError);
    }
    else if(data === util.INVALID_VALUE) {
        //data is an invalid value
        member.setResultInvalid(true);
    }
    else {
        //normal data update (poosibly from an asynchronouse update)
        member.setData(data);
    }
    
    actionResult.actionDone = true;
}

/** Update description */
function updateDescription(workspace,actionData,actionResult) {
    
    var memberFullName = actionData.memberName;
    var member = workspace.getMemberByFullName(memberFullName);
    if(!member) {
        actionResult.actionDone = false;
        actionResult.errorMsg = "Member not found for update member description";
        return;
    }
    actionResult.member = member;

    member.setDescription(actionData.description);
    
    actionResult.actionDone = true;
}
        
/** Update data action info */
let UPDATE_DATA_ACTION_INFO = {
    "action": "updateData",
    "actionFunction": updateData,
    "checkUpdateAll": false,
    "updateDependencies": true,
    "addToRecalc": false,
    "addDependenceiesToRecalc": true,
    "event": "memberUpdated"
};

/** Update code action info */
let UPDATE_CODE_ACTION_INFO = {
    "action": "updateCode",
    "actionFunction": updateCode,
    "checkUpdateAll": false,
    "updateDependencies": true,
    "addToRecalc": true,
    "event": "memberUpdated"
};

/** Update data action info */
let UPDATE_DESCRIPTION_ACTION_INFO = {
    "action": "updateDescription",
    "actionFunction": updateDescription,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": false,
    "addDependenceiesToRecalc": false,
    "event": "memberUpdated"
};


//The following code registers the actions
addActionInfo(UPDATE_DATA_ACTION_INFO);
addActionInfo(UPDATE_CODE_ACTION_INFO);
addActionInfo(UPDATE_DESCRIPTION_ACTION_INFO);

/** This is self installing command module. It has no exports
 * but it must be imported to install the command. 
 *
 * Action Data format:
 * {
 *  "action": "moveMember",
 *  "member": (member to move),
 *  
 *  "eventInfo": (OUTPUT - event info for the associated delete event)
 * }
 */

/** Move member action function */
function moveMember(workspace,actionData,actionResult) {
        
    var memberFullName = actionData.memberName;
    var member = workspace.getMemberByFullName(memberFullName);
    if(!member) {
        actionResult.actionDone = false;
        actionResult.errorMsg = "Member not found for move member";
        return;
    }
    actionResult.member = member;
    
    var targetOwnerFullName = actionData.targetOwnerName;
    var targetOwner = workspace.getMemberByFullName(targetOwnerFullName);
    if(!targetOwner) {
        actionResult.actionDone = false;
        actionResult.errorMsg = "New parent not found for move member";
        return;
    }
        
    member.move(actionData.targetName,targetOwner);
    actionResult.actionDone = true;
    
    //add the child action results
    addChildResults(member,actionResult);
}

function addChildResults(member,actionResult) {
    
    if(member.isParent) {
        actionResult.childActionResults = {};
        
        var childMap = member.getChildMap();
        for(var childName in childMap) {
            var child = childMap[childName];
            let childActionResult = {};
            childActionResult.actionDone = true;
            childActionResult.member = child;
            childActionResult.actionInfo = ACTION_INFO$1;
            
            actionResult.childActionResults[childName] = childActionResult;
            
            //add results for children to this member
            addChildResults(child,childActionResult);
        }
    }
    else if(member.isRootHolder) {
        actionResult.childActionResults = {};
        
        var root = member.getRoot();
        let childActionResult = {};
        childActionResult.actionDone = true;
        childActionResult.member = root;
        childActionResult.actionInfo = ACTION_INFO$1;

        actionResult.childActionResults["root"] = childActionResult;
        
        //add results for children to this member
        addChildResults(root,childActionResult);
    }
}


/** Action info */
let ACTION_INFO$1 = {
    "action": "moveMember",
    "actionFunction": moveMember,
    "checkUpdateAll": true,
    "updateDependencies": true,
    "addToRecalc": true,
    "event": "memberUpdated"
};


//This line of code registers the action 
addActionInfo(ACTION_INFO$1);

/** This is self installing command module. It has no exports
 * but it must be imported to install the command. 
 *
 * Action Data format:
 * {
 *  "action": "deleteMember",
 *  "member": (member to delete),
 *  
 *  "eventInfo": (OUTPUT - event info for the associated delete event)
 * }
 *
 * MEMBER DELETED EVENT: "memberDeleted"
 * Event object Format:
 * {
 *  "member": (member),
 *  }
 */


/** Delete member action function */
function deleteMember(workspace,actionData,actionResult) {
    
    var memberFullName = actionData.memberName;
    var member = workspace.getMemberByFullName(memberFullName);
    if(!member) {
        actionResult.actionDone = false;
        actionResult.errorMsg = "Member not found for delete member";
        return;
    }
    actionResult.member = member;
    
    doDelete(member,actionResult);
    
}


/** @private */
function doDelete(member,actionResult) {
    
    //delete children
    if(member.isParent) {
        actionResult.childActionResults = {};
        
        var childMap = member.getChildMap();
        for(var childName in childMap) {
            var child = childMap[childName];
            let childActionResult = {};
            childActionResult.member = child;
            childActionResult.actionInfo = ACTION_INFO$2;
            
            actionResult.childActionResults[childName] = childActionResult;
            
            //add results for children to this member
            doDelete(child,childActionResult);
        }
    }
    else if(member.isRootHolder) {
        actionResult.childActionResults = {};
        
        var root = member.getRoot();
        let childActionResult = {};
        childActionResult.member = root;
        childActionResult.actionInfo = ACTION_INFO$2;

        actionResult.childActionResults["root"] = childActionResult;
        
        //add results for children to this member
        doDelete(child,childActionResult);
    }
    
    //delete member
    member.onDeleteMember();
    if(member.isDependent) {
        member.onDeleteDependent();
    }
    
    actionResult.actionDone = true;
}


/** Action info */
let ACTION_INFO$2 = {
    "action": "deleteMember",
    "actionFunction": deleteMember,
    "checkUpdateAll": true,
    "updateDependencies": false,
    "addToRecalc": false,
    "event": "memberDeleted"
};


//This line of code registers the action 
addActionInfo(ACTION_INFO$2);

/** This is self installing command module. It has no exports
 * but it must be imported to install the command. 
 *
 * Action Data format:
 * {
 *  "action": "updateFolderFunction",
 *  "member": (member to move),
 *  "argList": (argument list, as an array of strings)
 *  "returnValueString": (name of the return value table)
 *  
 *  "eventInfo": (OUTPUT - event info for the associated delete event)
 * }
 */

/** Update folder function action function */
function updateProperties(workspace,actionData,actionResult) { 
    
    var memberFullName = actionData.memberName;
    var folderFunction = workspace.getMemberByFullName(memberFullName);
    if(!folderFunction) {
        actionResult.actionDone = false;
        actionResult.errorMsg = "Member not found for update member code";
        return;
    }
    actionResult.member = folderFunction;
    
    folderFunction.setArgList(actionData.argList);
    folderFunction.setReturnValueString(actionData.returnValueString);
    
    actionResult.actionDone = true;
}

/** Action info */
let ACTION_INFO$3 = {
    "action": "updateFolderFunction",
    "actionFunction": updateProperties,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": true,
    "event": "memberUpdated"
};


//This line of code registers the action 
addActionInfo(ACTION_INFO$3);

/** This is self installing command module. It has no exports
 * but it must be imported to install the command. 
 *
 * Action Data format:
 * {
 *  "action": "updateWorkspace",
 *  "workspace": (workspace to update),
 *  "properties": (properties to set) //currently only "name"
 * }
 *
 * member UPDATED EVENT: "workspaceUpdated"
 * Event member format:
 * {
 *  "member": (member)
 * }
 */

/** Update code action function. */
function updateWorkspace(workspace,actionData,actionResult) { 
    
    var properties = actionData.properties;
    if(properties) {
        if(properties.name) workspace.setName(properties.name);
    }
    
    actionResult.actionDone = true;
}

/** Update data action info */
let ACTION_INFO$4 = {
    "action": "updateWorkspace",
    "actionFunction": updateWorkspace,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": false,
    "addDependenceiesToRecalc": false,
    "event": "workspaceUpdated"
};

//The following code registers the actions
addActionInfo(ACTION_INFO$4);

/** These are self installing commands. They have no exports. */

/** This component encapsulates the member functionality for objects in the workspace.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 *  
 * COMPONENT DEPENDENCIES:
 * 
 * FIELD NAMES (from update event):
 * - data
 * - name
 * - owner
 * 
 */
let Member = {};
/** This serves as the constructor for the member object, when extending it. 
 * The owner should be the parent that holds this member or the object that holds
 * the hierarchy (maybe the workspace). If the owner is not a parent, this is typically
 * a folder and it is called the root folder. */
Member.init = function(name,generator) {
    this.id = Member._createId();
    this.name = name;
    
    this.data = null;
    this.impactsList = [];
    
    this.generator = generator;
    this.errors = []; 
    this.resultInvalid = false;
    this.resultPending = false;
    
    this.updated = {};
    
    //set updated in constructor
    this.fieldUpdated("name");
    this.fieldUpdated("data");
};

Member.initOwner = function(owner) {
    if(this.owner != owner) {
        this.fieldUpdated("owner");
    }
    
    this.owner = owner;
    if(owner.isParent) {
        this.owner.addChild(this);
    }
    else if(owner.isRootHolder) {
        this.owner.setRoot(this);
    }
};

Member.move = function(newName,newOwner) {

    //remove from old owner
    if(this.owner) {
        if(this.owner.isParent) {
            this.owner.removeChild(this);
        }
        else {
            //don't allow moving a root for now!
            //or renaiming either!
        }
    }
    
    //check for change of name
    if(newName != this.name) {
        this.fieldUpdated("name");
        
        this.name = newName;
    }
    
    //place in the new owner or update the name in the old owner
    //owner field updated here
    this.initOwner(newOwner);
};

/** This property tells if this object is a member.
 * This property should not be implemented on non-members. */
Member.isMember = true;

/** this method gets the ID. It is not persistent and is valid only for this 
 * instance the workspace is opened. */
Member.getId = function() {
    return this.id;
};

/** this method gets the name. */
Member.getName = function() {
    return this.name;
};

/** This method returns the full name in dot notation for this object. */
Member.getFullName = function() {
    if(this.owner) {
        return this.owner.getChildFullName(this.name);
    }
    else {
        //this shouldn't happen
        return this.name;
    }
};

/** This returns the owner for this member. */
Member.getOwner = function() {
    return this.owner;
};

/** This returns the parent for this member. For the root folder
 * this value is null. */
Member.getParent = function() {
    if((this.owner)&&(this.owner.isParent)) {
        return this.owner;
    }
    else {
        return null;
    }
};

/** this method gets the workspace. */
Member.getWorkspace = function() {
   if(this.owner) {
       return this.owner.getWorkspace();
   }
   else {
       return null;
   }
};

/** this method gets the root folder/namespace for this object. */
Member.getRoot = function() {
    var ancestor = this;
	while(ancestor) {
		var owner = ancestor.getOwner();
        if(!owner) {
            return null;
        }
        else if(!owner.isParent) {
            return ancestor;
        }
        ancestor = owner;
	} 
	return null; //this shouldn't happen
};

/** This method sets the pre calc error for this dependent. */
Member.addError = function(error) {
    this.errors.push(error);
};

/** This method sets the pre calc error for this dependent. */
Member.addErrors = function(errorList) {
    this.errors = this.errors.concat(errorList);
};

/** This method clears the error list. */
Member.clearErrors = function(type) {
    var newList = [];
    if(type != null) {    
        for(var i = 0; i < this.errors.length; i++) {
            var entry = this.errors[i];
            if(entry.type != type) {
                newList.push(entry);
            }
        }
    }
    this.errors = newList;
};

/** This returns true if there is a pre calc error. */
Member.hasError = function() {
    return (this.errors.length > 0);
};

/** This returns the pre calc error. */
Member.getErrors = function() {
    return this.errors;
};

/** This returns true if the member is not up to date, typically
 * do to waiting on an asynchronous operation. */
Member.getResultPending = function() {
    return this.resultPending;
};

/** This returns true if the member is not up to date, typically
 * do to waiting on an asynchronous operation. */
Member.getPendingPromise = function() {
    return this.pendingPromise;
};

/** This sets the result pending flag. If is pending is set to true and
 * this is the object whose value is pending (as opposed to a member that 
 * is dependent on the pending member) the promise should be saved. This 
 * is used to ensure only a matching asynchronous action is kept. */
Member.setResultPending = function(isPending,promise) {
    this.resultPending = isPending;
    this.pendingPromise = promise;
};

/** This returns true if the member is invalid, typically
 * meaning the calculation could not properly be performed becase the
 * needed data is not available. */
Member.getResultInvalid = function() {
    return this.resultInvalid;
};

/** This sets the result invalid flag. If the result is invalid, any
 * table depending on this will also have an invalid value. */
Member.setResultInvalid = function(isInvalid) {
    this.resultInvalid = isInvalid;
};

/** This returns true if the pending token matches. */
Member.pendingPromiseMatches = function(promise) {
    return (this.pendingPromise === promise);
};

Member.getSetDataOk = function() {
    return this.generator.setDataOk;
};

/** This method writes the child to a json. */
Member.toJson = function() {
	var json = {};
    json.name = this.name;
    json.type = this.generator.type;
    if(this.addToJson) {
        this.addToJson(json);
    }
    
    if(this.getUpdateData) {
        var updateData = this.getUpdateData();
        json.updateData = updateData;
    }
    return json;
};

///** This method creates a member from a json. IT should be implemented as a static
// * function in extending objects. */ 
//Member.fromJson = function(owner,json,childrenJsonOutputList) {
//}

//-----------------------------------
// Data methods
//-----------------------------------

/** this method gets the data map. */
Member.getData = function() {
    return this.data;
};

/** This returns an array of members this member impacts. */
Member.getImpactsList = function() {
    return this.impactsList;
};

/** This method sets the data for this object. This is the object used by the 
 * code which is identified by this name, for example the JSON object associated
 * with a JSON table. Besides hold the data object, this updates the parent data map. */
Member.setData = function(data) {
    this.data = data;
    this.fieldUpdated("data");
  
    var parent = this.getParent();
    if(parent) {
        parent.updateData(this);
    }
};


/** This method implements setting asynchronous data on the member using a promise. */
Member.applyPromiseData = function(promise,onAsynchComplete,optionalPromiseRefresh) {
    //set the result as pending
    this.setResultPending(true,promise);

    //kick off the asynch update, if this is not only a refresh of the promise
    if(!optionalPromiseRefresh) {
        var workspace = this.getWorkspace();
        var asynchCallback = memberValue => {
            //set the data for the table, along with triggering updates on dependent tables.
            let actionData = {};
            actionData.action = "updateData";
            actionData.memberName = this.getFullName();
            actionData.sourcePromise = promise;
            actionData.data = memberValue;
            if(onAsynchComplete) {
                actionData.onComplete = onAsynchComplete;
            }
            doAction(workspace,actionData);
        };
        var asynchErrorCallback = errorMsg => {
            let actionData = {};
            actionData.action = "updateData";
            actionData.memberName = this.getFullName();
            actionData.sourcePromise = promise;
            actionData.data = new Error(errorMsg);
            if(onAsynchComplete) {
                actionData.onComplete = onAsynchComplete;
            }
            doAction(workspace,actionData);
        };

        //call appropriate action when the promise completes
        promise.then(asynchCallback).catch(asynchErrorCallback);
    }
};

//========================================
// "Protected" Methods
//========================================

/** This method is called when the member is deleted. If necessary the implementation
 * can extend this function, but it should call this base version of the function
 * if it does.  
 * @protected */
Member.onDeleteMember = function() {
    if(!(this.owner)) return;
    
	if(this.owner.isParent) {
		this.owner.removeChild(this);
	}
    else if(this.owner.isRootHolder) {
        this.owner.setRoot(null);
    }
    this.owner = null;
};

///** This method is called when the workspace is closed and also when an object
// * is deleted. It should do any needed cleanup for the object.  
// * @protected */
//Member.onClose = function();

//Implement this method if there is data to add to this member. Otherwise it may
//be omitted
///** This method adds any additional data to the json saved for this member. 
// * @protected */
//Member.addToJson = function(json) {
//}

//Implement this method if there is update data for this json. otherwise it may
//be omitted
///** This gets an update structure to upsate a newly instantiated member
//* to match the current object. It may return "undefined" if there is no update
//* data needed. 
//* @protected */
//Member.getUpdateData = function() {
//}

//-------------------------
// Update Event Methods
//-------------------------

Member.getUpdated = function() {
    return this.updated;
};

Member.clearUpdated = function() {
    this.updated = {};
};

Member.fieldUpdated = function(field) {
    this.updated[field] = true;
};


//===================================
// Private Functions
//===================================

/** This method adds a data member to the imapacts list for this node.
 * The return value is true if the member was added and false if it was already there. 
 * @private */
Member.addToImpactsList = function(member) {
    //exclude this member
    if(member === this) return;
    
    //add to the list iff it is not already there
    if(this.impactsList.indexOf(member) === -1) {
        this.impactsList.push(member);
        return true;
    }
    else {
        return false;
    }
};

/** This method removes a data member from the imapacts list for this node. 
 * @private */
Member.removeFromImpactsList = function(member) {
    //it should appear only once
    for(var i = 0; i < this.impactsList.length; i++) {
        if(this.impactsList[i] == member) {
            this.impactsList.splice(i,1);
            return;
        }
    }
};

/** This is used for Id generation.
 * @private */
Member.nextId = 1;

/** This method generates a member ID for the member. It is only valid
 * for the duration the workspace is opened. It is not persisted.
 * @private
 */
Member._createId = function() {
    return Member.nextId++;
};

/** This mixin encapsulates an member whose value depends on on another
 * member. The dependent allows for a recalculation based on an update of the 
 * objects it depends on.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A Dependent must be a Member.
 * 
 */
let Dependent$1 = {};
/** This initializes the component */
Dependent$1.init = function() {
    
    //this is the list of dependencies
    this.dependsOnList = [];
    this.calcPending = false;
};

/** This property tells if this object is a dependent.
 * This property should not be implemented on non-dependents. */
Dependent$1.isDependent = true;

/** This returns a list of the members that this member depends on. */
Dependent$1.getDependsOn = function() {
    return this.dependsOnList;
};

/** This returns the calc pending flag.  */
Dependent$1.getCalcPending = function() {
    return this.calcPending;
};

/** This sets the calc pending flag to false. It should be called when the 
 * calcultion is no longer needed.  */
Dependent$1.clearCalcPending = function() {
    this.calcPending = false;
};

//Must be implemented in extending object
///** This method udpates the dependencies if needed because
// *a variable was added or removed from the workspace.  */
//Dependent.updateDependeciesForModelChange = function(object);

///** This is a check to see if the object should be checked for dependencies 
// * for recalculation. It is safe for this method to always return false and
// allow the calculation to happen. 
// * @private */
//Dependent.needsCalculating = function();

/** This does any init needed for calculation.  */
Dependent$1.prepareForCalculate = function() {
    this.clearErrors();
    this.setResultPending(false);
    this.setResultInvalid(false);
    this.calcPending = true;
};

///** This updates the member based on a change in a dependency.  */
//Dependent.calculate = function();

/** This method makes sure any impactors are set. It sets a dependency 
 * error if one or more of the dependencies has a error. */
Dependent$1.initializeImpactors = function() {
    var errorDependencies = [];
    var resultPending = false;
    var resultInvalid = false;
    
    //make sure dependencies are up to date
    for(var i = 0; i < this.dependsOnList.length; i++) {
        var impactor = this.dependsOnList[i];
        if((impactor.isDependent)&&(impactor.getCalcPending())) {
            impactor.calculate();
        }
        if(impactor.hasError()) {
            errorDependencies.push(impactor);
        } 
        else if(impactor.getResultPending()) {
            resultPending = true;
        }
        else if(impactor.getResultInvalid()) {
            resultInvalid = true;
        }
    }

    if(errorDependencies.length > 0) {
        this.createDependencyError(errorDependencies);
    }
    else if(resultPending) {
        this.setResultPending(true,null);
    }
    else if(resultInvalid) {
        this.setResultInvalid(true);
    }
};

/** This method does any needed cleanup when the dependent is depeted.. */
Dependent$1.onDeleteDependent = function() {
    //remove this dependent from the impactor
    for(var i = 0; i < this.dependsOnList.length; i++) {
        var remoteMember = this.dependsOnList[i];
        //remove from imacts list
        remoteMember.removeFromImpactsList(this);
    }
};
//===================================
// Private Functions
//===================================

/** This sets the dependencies based on the code for the member. */
Dependent$1.updateDependencies = function(newDependsOn) {
    
    var dependenciesUpdated = false;
    
    if(!newDependsOn) {
        newDependsOn = [];
    }
    
	//retireve the old list
    var oldDependsOn = this.dependsOnList;
	
    //create the new dependency list
	this.dependsOnList = [];
	
    //update the dependency links among the members
	var newDependencySet = {};
    var remoteMember;
    var i;
    for(i = 0; i < newDependsOn.length; i++) {
        remoteMember = newDependsOn[i];
			
        this.dependsOnList.push(remoteMember);

        //update this member
        var isNewAddition = remoteMember.addToImpactsList(this);
        if(isNewAddition) {
            dependenciesUpdated = true;
        }

        //create a set of new member to use below
        newDependencySet[remoteMember.getId()] = true;
		
    }
	
    //update for links that have gotten deleted
    for(i = 0; i < oldDependsOn.length; i++) {
        remoteMember = oldDependsOn[i];
		
		var stillDependsOn = newDependencySet[remoteMember.getId()];
		
		if(!stillDependsOn) {
			//remove from imacts list
			remoteMember.removeFromImpactsList(this);
            dependenciesUpdated = true;
		}
    }
//    this.dependenciesSet = true;
    
    return dependenciesUpdated;
};

/** This method creates an dependency error, given a list of impactors that have an error. 
 * @private */
Dependent$1.createDependencyError = function(errorDependencies) {
        //dependency error found
        var message = "Error in dependency: ";
        for(var i = 0; i < errorDependencies.length; i++) {
            if(i > 0) message += ", ";
            message += errorDependencies[i].getFullName();
        }
        var actionError = new ActionError(message,"Calculation - Dependency",this);
        this.addError(actionError);   

};

/** This is a messenger class for sending action messages. 
 * If the send fails, and exception will be thrown. */
class Messenger {
    
    constructor(fromMember) {
        this.workspace = fromMember.getWorkspace();
        this.contextManager = fromMember.getContextManager();
        this.fromMember = fromMember;
    }

    /** This is a convenience method to set a member to a given value.
     * updateMemberName - This is a member name as it would be accessed from the local code
     * data - This is the data to set on the given member. Aside from a JSON value, additional 
     * options are a Promise, to do an asynchronous update, a Error, to send an error to 
     * that table, or util.INVALID_VALUE to send the invalid value.
     * These updates are applied after the current calculation is completed. See documentation
     * for more information on the messenger. */
    dataUpdate(updateMemberName,data) {
        
        var member = this._getMemberObject(updateMemberName);
        if(!member) {
            throw new Error("Error calling messenger - member not fond: " + updateMemberName);
        }
        
        //set the data for the table, along with triggering updates on dependent tables.
        var actionData = {};
        actionData.action = "updateData";
        actionData.memberName = member.getFullName();
        actionData.data = data;
        actionData.onComplete = actionResult => {
            if(!actionResult.actionDone) {
                throw new Error("Error setting remote data: " + actionResult.alertMsg);
            }
        };
        
        //return is handled above asynchronously
        doAction(this.workspace,actionData);
    }

    /** This is similar to dataUpdate except is allows multiple values to be set.
     * The argument update info is an array with each element representing an individual
     * data update. Each element shoudl be a 2-element array with the first entry being
     * the table name and the second being the data value. */
    compoundDataUpdate(updateInfo) { 
        
        //make the action list
        var actionList = [];
        for(var i = 0; i < updateInfo.length; i++) {
            let updateEntry = updateInfo[i];
            let subActionData = {};
            
            let member = this._getMemberObject(updateEntry[0]);
            if(!member) {
                throw new Error("Error calling messenger - member not fond: " + updateMemberName);
            }
            let data = updateEntry[1];
            
            subActionData.action = "updateData";
            subActionData.memberName = member.getFullName();
            subActionData.data = data;
            actionList.push(subActionData);
        }
        
        //create the single compound action
        var actionData = {};
        actionData.action = "compoundAction";
        actionData.actions = actionList;
        
        //action is done later after the current action completes
        actionData.onComplete = actionResult => {
            if(!actionResult.actionDone) {
                throw new Error("Error setting remote data: " + actionResult.alertMsg);
            }
        };
        
        //return is handled above asynchronously
        doAction(this.workspace,actionData);
    }
    
    //=====================
    // Private Functions
    //=====================
    
    
    /** This method returns the member instance for a given local member name,
     * as defined from the source object context. */
    _getMemberObject(localMemberName) { 
        var path = localMemberName.split(".");
        var member = this.contextManager.getMember(path);
        return member;
    }
}

/*
  Copyright (c) jQuery Foundation, Inc. and Contributors, All Rights Reserved.

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

//-----------------------------------------
// ES6 Module Conversion - Added to execute this UMD module as CommonJS and use "exports" as the export.
// Additional code appears at the bottom of the file.
let module$1 = {};
module$1.exports = {};
let exports$1 = module$1.exports;
//------------------------------------------

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else if (typeof exports$1 !== 'undefined') {
        factory(exports$1);
    } else {
        factory((root.esprima = {}));
    }
}(undefined, function (exports) {
    var Token,
        TokenName,
        FnExprTokens,
        Syntax,
        PlaceHolders,
        Messages,
        Regex,
        source,
        strict,
        index,
        lineNumber,
        lineStart,
        hasLineTerminator,
        lastIndex,
        lastLineNumber,
        lastLineStart,
        startIndex,
        startLineNumber,
        startLineStart,
        scanning,
        length,
        lookahead,
        state,
        extra,
        isBindingElement,
        isAssignmentTarget,
        firstCoverInitializedNameError;

    Token = {
        BooleanLiteral: 1,
        EOF: 2,
        Identifier: 3,
        Keyword: 4,
        NullLiteral: 5,
        NumericLiteral: 6,
        Punctuator: 7,
        StringLiteral: 8,
        RegularExpression: 9,
        Template: 10
    };

    TokenName = {};
    TokenName[Token.BooleanLiteral] = 'Boolean';
    TokenName[Token.EOF] = '<end>';
    TokenName[Token.Identifier] = 'Identifier';
    TokenName[Token.Keyword] = 'Keyword';
    TokenName[Token.NullLiteral] = 'Null';
    TokenName[Token.NumericLiteral] = 'Numeric';
    TokenName[Token.Punctuator] = 'Punctuator';
    TokenName[Token.StringLiteral] = 'String';
    TokenName[Token.RegularExpression] = 'RegularExpression';
    TokenName[Token.Template] = 'Template';

    // A function following one of those tokens is an expression.
    FnExprTokens = ['(', '{', '[', 'in', 'typeof', 'instanceof', 'new',
                    'return', 'case', 'delete', 'throw', 'void',
                    // assignment operators
                    '=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=',
                    '&=', '|=', '^=', ',',
                    // binary/unary operators
                    '+', '-', '*', '/', '%', '++', '--', '<<', '>>', '>>>', '&',
                    '|', '^', '!', '~', '&&', '||', '?', ':', '===', '==', '>=',
                    '<=', '<', '>', '!=', '!=='];

    Syntax = {
        AssignmentExpression: 'AssignmentExpression',
        AssignmentPattern: 'AssignmentPattern',
        ArrayExpression: 'ArrayExpression',
        ArrayPattern: 'ArrayPattern',
        ArrowFunctionExpression: 'ArrowFunctionExpression',
        BlockStatement: 'BlockStatement',
        BinaryExpression: 'BinaryExpression',
        BreakStatement: 'BreakStatement',
        CallExpression: 'CallExpression',
        CatchClause: 'CatchClause',
        ClassBody: 'ClassBody',
        ClassDeclaration: 'ClassDeclaration',
        ClassExpression: 'ClassExpression',
        ConditionalExpression: 'ConditionalExpression',
        ContinueStatement: 'ContinueStatement',
        DoWhileStatement: 'DoWhileStatement',
        DebuggerStatement: 'DebuggerStatement',
        EmptyStatement: 'EmptyStatement',
        ExportAllDeclaration: 'ExportAllDeclaration',
        ExportDefaultDeclaration: 'ExportDefaultDeclaration',
        ExportNamedDeclaration: 'ExportNamedDeclaration',
        ExportSpecifier: 'ExportSpecifier',
        ExpressionStatement: 'ExpressionStatement',
        ForStatement: 'ForStatement',
        ForOfStatement: 'ForOfStatement',
        ForInStatement: 'ForInStatement',
        FunctionDeclaration: 'FunctionDeclaration',
        FunctionExpression: 'FunctionExpression',
        Identifier: 'Identifier',
        IfStatement: 'IfStatement',
        ImportDeclaration: 'ImportDeclaration',
        ImportDefaultSpecifier: 'ImportDefaultSpecifier',
        ImportNamespaceSpecifier: 'ImportNamespaceSpecifier',
        ImportSpecifier: 'ImportSpecifier',
        Literal: 'Literal',
        LabeledStatement: 'LabeledStatement',
        LogicalExpression: 'LogicalExpression',
        MemberExpression: 'MemberExpression',
        MetaProperty: 'MetaProperty',
        MethodDefinition: 'MethodDefinition',
        NewExpression: 'NewExpression',
        ObjectExpression: 'ObjectExpression',
        ObjectPattern: 'ObjectPattern',
        Program: 'Program',
        Property: 'Property',
        RestElement: 'RestElement',
        ReturnStatement: 'ReturnStatement',
        SequenceExpression: 'SequenceExpression',
        SpreadElement: 'SpreadElement',
        Super: 'Super',
        SwitchCase: 'SwitchCase',
        SwitchStatement: 'SwitchStatement',
        TaggedTemplateExpression: 'TaggedTemplateExpression',
        TemplateElement: 'TemplateElement',
        TemplateLiteral: 'TemplateLiteral',
        ThisExpression: 'ThisExpression',
        ThrowStatement: 'ThrowStatement',
        TryStatement: 'TryStatement',
        UnaryExpression: 'UnaryExpression',
        UpdateExpression: 'UpdateExpression',
        VariableDeclaration: 'VariableDeclaration',
        VariableDeclarator: 'VariableDeclarator',
        WhileStatement: 'WhileStatement',
        WithStatement: 'WithStatement',
        YieldExpression: 'YieldExpression'
    };

    PlaceHolders = {
        ArrowParameterPlaceHolder: 'ArrowParameterPlaceHolder'
    };

    // Error messages should be identical to V8.
    Messages = {
        UnexpectedToken: 'Unexpected token %0',
        UnexpectedNumber: 'Unexpected number',
        UnexpectedString: 'Unexpected string',
        UnexpectedIdentifier: 'Unexpected identifier',
        UnexpectedReserved: 'Unexpected reserved word',
        UnexpectedTemplate: 'Unexpected quasi %0',
        UnexpectedEOS: 'Unexpected end of input',
        NewlineAfterThrow: 'Illegal newline after throw',
        InvalidRegExp: 'Invalid regular expression',
        UnterminatedRegExp: 'Invalid regular expression: missing /',
        InvalidLHSInAssignment: 'Invalid left-hand side in assignment',
        InvalidLHSInForIn: 'Invalid left-hand side in for-in',
        InvalidLHSInForLoop: 'Invalid left-hand side in for-loop',
        MultipleDefaultsInSwitch: 'More than one default clause in switch statement',
        NoCatchOrFinally: 'Missing catch or finally after try',
        UnknownLabel: 'Undefined label \'%0\'',
        Redeclaration: '%0 \'%1\' has already been declared',
        IllegalContinue: 'Illegal continue statement',
        IllegalBreak: 'Illegal break statement',
        IllegalReturn: 'Illegal return statement',
        StrictModeWith: 'Strict mode code may not include a with statement',
        StrictCatchVariable: 'Catch variable may not be eval or arguments in strict mode',
        StrictVarName: 'Variable name may not be eval or arguments in strict mode',
        StrictParamName: 'Parameter name eval or arguments is not allowed in strict mode',
        StrictParamDupe: 'Strict mode function may not have duplicate parameter names',
        StrictFunctionName: 'Function name may not be eval or arguments in strict mode',
        StrictOctalLiteral: 'Octal literals are not allowed in strict mode.',
        StrictDelete: 'Delete of an unqualified identifier in strict mode.',
        StrictLHSAssignment: 'Assignment to eval or arguments is not allowed in strict mode',
        StrictLHSPostfix: 'Postfix increment/decrement may not have eval or arguments operand in strict mode',
        StrictLHSPrefix: 'Prefix increment/decrement may not have eval or arguments operand in strict mode',
        StrictReservedWord: 'Use of future reserved word in strict mode',
        TemplateOctalLiteral: 'Octal literals are not allowed in template strings.',
        ParameterAfterRestParameter: 'Rest parameter must be last formal parameter',
        DefaultRestParameter: 'Unexpected token =',
        ObjectPatternAsRestParameter: 'Unexpected token {',
        DuplicateProtoProperty: 'Duplicate __proto__ fields are not allowed in object literals',
        ConstructorSpecialMethod: 'Class constructor may not be an accessor',
        DuplicateConstructor: 'A class may only have one constructor',
        StaticPrototype: 'Classes may not have static property named prototype',
        MissingFromClause: 'Unexpected token',
        NoAsAfterImportNamespace: 'Unexpected token',
        InvalidModuleSpecifier: 'Unexpected token',
        IllegalImportDeclaration: 'Unexpected token',
        IllegalExportDeclaration: 'Unexpected token',
        DuplicateBinding: 'Duplicate binding %0'
    };

    // See also tools/generate-unicode-regex.js.
    Regex = {
        // ECMAScript 6/Unicode v7.0.0 NonAsciiIdentifierStart:
        NonAsciiIdentifierStart: /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B2\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309B-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48]|\uD804[\uDC03-\uDC37\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDE00-\uDE11\uDE13-\uDE2B\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF5D-\uDF61]|\uD805[\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDE00-\uDE2F\uDE44\uDE80-\uDEAA]|\uD806[\uDCA0-\uDCDF\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF98]|\uD809[\uDC00-\uDC6E]|[\uD80C\uD840-\uD868\uD86A-\uD86C][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50\uDF93-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD83A[\uDC00-\uDCC4]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D]|\uD87E[\uDC00-\uDE1D]/,

        // ECMAScript 6/Unicode v7.0.0 NonAsciiIdentifierPart:
        NonAsciiIdentifierPart: /[\xAA\xB5\xB7\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B2\u08E4-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1369-\u1371\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA69D\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2D\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDD0-\uDDDA\uDE00-\uDE11\uDE13-\uDE37\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF01-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3C-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB7\uDEC0-\uDEC9]|\uD806[\uDCA0-\uDCE9\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF98]|\uD809[\uDC00-\uDC6E]|[\uD80C\uD840-\uD868\uD86A-\uD86C][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50-\uDF7E\uDF8F-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D]|\uD87E[\uDC00-\uDE1D]|\uDB40[\uDD00-\uDDEF]/
    };

    // Ensure the condition is true, otherwise throw an error.
    // This is only to have a better contract semantic, i.e. another safety net
    // to catch a logic error. The condition shall be fulfilled in normal case.
    // Do NOT use this to enforce a certain condition on any user input.

    function assert(condition, message) {
        /* istanbul ignore if */
        if (!condition) {
            throw new Error('ASSERT: ' + message);
        }
    }

    function isDecimalDigit(ch) {
        return (ch >= 0x30 && ch <= 0x39);   // 0..9
    }

    function isHexDigit(ch) {
        return '0123456789abcdefABCDEF'.indexOf(ch) >= 0;
    }

    function isOctalDigit(ch) {
        return '01234567'.indexOf(ch) >= 0;
    }

    function octalToDecimal(ch) {
        // \0 is not octal escape sequence
        var octal = (ch !== '0'), code = '01234567'.indexOf(ch);

        if (index < length && isOctalDigit(source[index])) {
            octal = true;
            code = code * 8 + '01234567'.indexOf(source[index++]);

            // 3 digits are only allowed when string starts
            // with 0, 1, 2, 3
            if ('0123'.indexOf(ch) >= 0 &&
                    index < length &&
                    isOctalDigit(source[index])) {
                code = code * 8 + '01234567'.indexOf(source[index++]);
            }
        }

        return {
            code: code,
            octal: octal
        };
    }

    // ECMA-262 11.2 White Space

    function isWhiteSpace(ch) {
        return (ch === 0x20) || (ch === 0x09) || (ch === 0x0B) || (ch === 0x0C) || (ch === 0xA0) ||
            (ch >= 0x1680 && [0x1680, 0x180E, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000, 0xFEFF].indexOf(ch) >= 0);
    }

    // ECMA-262 11.3 Line Terminators

    function isLineTerminator(ch) {
        return (ch === 0x0A) || (ch === 0x0D) || (ch === 0x2028) || (ch === 0x2029);
    }

    // ECMA-262 11.6 Identifier Names and Identifiers

    function fromCodePoint(cp) {
        return (cp < 0x10000) ? String.fromCharCode(cp) :
            String.fromCharCode(0xD800 + ((cp - 0x10000) >> 10)) +
            String.fromCharCode(0xDC00 + ((cp - 0x10000) & 1023));
    }

    function isIdentifierStart(ch) {
        return (ch === 0x24) || (ch === 0x5F) ||  // $ (dollar) and _ (underscore)
            (ch >= 0x41 && ch <= 0x5A) ||         // A..Z
            (ch >= 0x61 && ch <= 0x7A) ||         // a..z
            (ch === 0x5C) ||                      // \ (backslash)
            ((ch >= 0x80) && Regex.NonAsciiIdentifierStart.test(fromCodePoint(ch)));
    }

    function isIdentifierPart(ch) {
        return (ch === 0x24) || (ch === 0x5F) ||  // $ (dollar) and _ (underscore)
            (ch >= 0x41 && ch <= 0x5A) ||         // A..Z
            (ch >= 0x61 && ch <= 0x7A) ||         // a..z
            (ch >= 0x30 && ch <= 0x39) ||         // 0..9
            (ch === 0x5C) ||                      // \ (backslash)
            ((ch >= 0x80) && Regex.NonAsciiIdentifierPart.test(fromCodePoint(ch)));
    }

    // ECMA-262 11.6.2.2 Future Reserved Words

    function isFutureReservedWord(id) {
        switch (id) {
        case 'enum':
        case 'export':
        case 'import':
        case 'super':
            return true;
        default:
            return false;
        }
    }

    function isStrictModeReservedWord(id) {
        switch (id) {
        case 'implements':
        case 'interface':
        case 'package':
        case 'private':
        case 'protected':
        case 'public':
        case 'static':
        case 'yield':
        case 'let':
            return true;
        default:
            return false;
        }
    }

    function isRestrictedWord(id) {
        return id === 'eval' || id === 'arguments';
    }

    // ECMA-262 11.6.2.1 Keywords

    function isKeyword(id) {
        switch (id.length) {
        case 2:
            return (id === 'if') || (id === 'in') || (id === 'do');
        case 3:
            return (id === 'var') || (id === 'for') || (id === 'new') ||
                (id === 'try') || (id === 'let');
        case 4:
            return (id === 'this') || (id === 'else') || (id === 'case') ||
                (id === 'void') || (id === 'with') || (id === 'enum');
        case 5:
            return (id === 'while') || (id === 'break') || (id === 'catch') ||
                (id === 'throw') || (id === 'const') || (id === 'yield') ||
                (id === 'class') || (id === 'super');
        case 6:
            return (id === 'return') || (id === 'typeof') || (id === 'delete') ||
                (id === 'switch') || (id === 'export') || (id === 'import');
        case 7:
            return (id === 'default') || (id === 'finally') || (id === 'extends');
        case 8:
            return (id === 'function') || (id === 'continue') || (id === 'debugger');
        case 10:
            return (id === 'instanceof');
        default:
            return false;
        }
    }

    // ECMA-262 11.4 Comments

    function addComment(type, value, start, end, loc) {
        var comment;

        assert(typeof start === 'number', 'Comment must have valid position');

        state.lastCommentStart = start;

        comment = {
            type: type,
            value: value
        };
        if (extra.range) {
            comment.range = [start, end];
        }
        if (extra.loc) {
            comment.loc = loc;
        }
        extra.comments.push(comment);
        if (extra.attachComment) {
            extra.leadingComments.push(comment);
            extra.trailingComments.push(comment);
        }
        if (extra.tokenize) {
            comment.type = comment.type + 'Comment';
            if (extra.delegate) {
                comment = extra.delegate(comment);
            }
            extra.tokens.push(comment);
        }
    }

    function skipSingleLineComment(offset) {
        var start, loc, ch, comment;

        start = index - offset;
        loc = {
            start: {
                line: lineNumber,
                column: index - lineStart - offset
            }
        };

        while (index < length) {
            ch = source.charCodeAt(index);
            ++index;
            if (isLineTerminator(ch)) {
                hasLineTerminator = true;
                if (extra.comments) {
                    comment = source.slice(start + offset, index - 1);
                    loc.end = {
                        line: lineNumber,
                        column: index - lineStart - 1
                    };
                    addComment('Line', comment, start, index - 1, loc);
                }
                if (ch === 13 && source.charCodeAt(index) === 10) {
                    ++index;
                }
                ++lineNumber;
                lineStart = index;
                return;
            }
        }

        if (extra.comments) {
            comment = source.slice(start + offset, index);
            loc.end = {
                line: lineNumber,
                column: index - lineStart
            };
            addComment('Line', comment, start, index, loc);
        }
    }

    function skipMultiLineComment() {
        var start, loc, ch, comment;

        if (extra.comments) {
            start = index - 2;
            loc = {
                start: {
                    line: lineNumber,
                    column: index - lineStart - 2
                }
            };
        }

        while (index < length) {
            ch = source.charCodeAt(index);
            if (isLineTerminator(ch)) {
                if (ch === 0x0D && source.charCodeAt(index + 1) === 0x0A) {
                    ++index;
                }
                hasLineTerminator = true;
                ++lineNumber;
                ++index;
                lineStart = index;
            } else if (ch === 0x2A) {
                // Block comment ends with '*/'.
                if (source.charCodeAt(index + 1) === 0x2F) {
                    ++index;
                    ++index;
                    if (extra.comments) {
                        comment = source.slice(start + 2, index - 2);
                        loc.end = {
                            line: lineNumber,
                            column: index - lineStart
                        };
                        addComment('Block', comment, start, index, loc);
                    }
                    return;
                }
                ++index;
            } else {
                ++index;
            }
        }

        // Ran off the end of the file - the whole thing is a comment
        if (extra.comments) {
            loc.end = {
                line: lineNumber,
                column: index - lineStart
            };
            comment = source.slice(start + 2, index);
            addComment('Block', comment, start, index, loc);
        }
        tolerateUnexpectedToken();
    }

    function skipComment() {
        var ch, start;
        hasLineTerminator = false;

        start = (index === 0);
        while (index < length) {
            ch = source.charCodeAt(index);

            if (isWhiteSpace(ch)) {
                ++index;
            } else if (isLineTerminator(ch)) {
                hasLineTerminator = true;
                ++index;
                if (ch === 0x0D && source.charCodeAt(index) === 0x0A) {
                    ++index;
                }
                ++lineNumber;
                lineStart = index;
                start = true;
            } else if (ch === 0x2F) { // U+002F is '/'
                ch = source.charCodeAt(index + 1);
                if (ch === 0x2F) {
                    ++index;
                    ++index;
                    skipSingleLineComment(2);
                    start = true;
                } else if (ch === 0x2A) {  // U+002A is '*'
                    ++index;
                    ++index;
                    skipMultiLineComment();
                } else {
                    break;
                }
            } else if (start && ch === 0x2D) { // U+002D is '-'
                // U+003E is '>'
                if ((source.charCodeAt(index + 1) === 0x2D) && (source.charCodeAt(index + 2) === 0x3E)) {
                    // '-->' is a single-line comment
                    index += 3;
                    skipSingleLineComment(3);
                } else {
                    break;
                }
            } else if (ch === 0x3C) { // U+003C is '<'
                if (source.slice(index + 1, index + 4) === '!--') {
                    ++index; // `<`
                    ++index; // `!`
                    ++index; // `-`
                    ++index; // `-`
                    skipSingleLineComment(4);
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    function scanHexEscape(prefix) {
        var i, len, ch, code = 0;

        len = (prefix === 'u') ? 4 : 2;
        for (i = 0; i < len; ++i) {
            if (index < length && isHexDigit(source[index])) {
                ch = source[index++];
                code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
            } else {
                return '';
            }
        }
        return String.fromCharCode(code);
    }

    function scanUnicodeCodePointEscape() {
        var ch, code;

        ch = source[index];
        code = 0;

        // At least, one hex digit is required.
        if (ch === '}') {
            throwUnexpectedToken();
        }

        while (index < length) {
            ch = source[index++];
            if (!isHexDigit(ch)) {
                break;
            }
            code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
        }

        if (code > 0x10FFFF || ch !== '}') {
            throwUnexpectedToken();
        }

        return fromCodePoint(code);
    }

    function codePointAt(i) {
        var cp, first, second;

        cp = source.charCodeAt(i);
        if (cp >= 0xD800 && cp <= 0xDBFF) {
            second = source.charCodeAt(i + 1);
            if (second >= 0xDC00 && second <= 0xDFFF) {
                first = cp;
                cp = (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
            }
        }

        return cp;
    }

    function getComplexIdentifier() {
        var cp, ch, id;

        cp = codePointAt(index);
        id = fromCodePoint(cp);
        index += id.length;

        // '\u' (U+005C, U+0075) denotes an escaped character.
        if (cp === 0x5C) {
            if (source.charCodeAt(index) !== 0x75) {
                throwUnexpectedToken();
            }
            ++index;
            if (source[index] === '{') {
                ++index;
                ch = scanUnicodeCodePointEscape();
            } else {
                ch = scanHexEscape('u');
                cp = ch.charCodeAt(0);
                if (!ch || ch === '\\' || !isIdentifierStart(cp)) {
                    throwUnexpectedToken();
                }
            }
            id = ch;
        }

        while (index < length) {
            cp = codePointAt(index);
            if (!isIdentifierPart(cp)) {
                break;
            }
            ch = fromCodePoint(cp);
            id += ch;
            index += ch.length;

            // '\u' (U+005C, U+0075) denotes an escaped character.
            if (cp === 0x5C) {
                id = id.substr(0, id.length - 1);
                if (source.charCodeAt(index) !== 0x75) {
                    throwUnexpectedToken();
                }
                ++index;
                if (source[index] === '{') {
                    ++index;
                    ch = scanUnicodeCodePointEscape();
                } else {
                    ch = scanHexEscape('u');
                    cp = ch.charCodeAt(0);
                    if (!ch || ch === '\\' || !isIdentifierPart(cp)) {
                        throwUnexpectedToken();
                    }
                }
                id += ch;
            }
        }

        return id;
    }

    function getIdentifier() {
        var start, ch;

        start = index++;
        while (index < length) {
            ch = source.charCodeAt(index);
            if (ch === 0x5C) {
                // Blackslash (U+005C) marks Unicode escape sequence.
                index = start;
                return getComplexIdentifier();
            } else if (ch >= 0xD800 && ch < 0xDFFF) {
                // Need to handle surrogate pairs.
                index = start;
                return getComplexIdentifier();
            }
            if (isIdentifierPart(ch)) {
                ++index;
            } else {
                break;
            }
        }

        return source.slice(start, index);
    }

    function scanIdentifier() {
        var start, id, type;

        start = index;

        // Backslash (U+005C) starts an escaped character.
        id = (source.charCodeAt(index) === 0x5C) ? getComplexIdentifier() : getIdentifier();

        // There is no keyword or literal with only one character.
        // Thus, it must be an identifier.
        if (id.length === 1) {
            type = Token.Identifier;
        } else if (isKeyword(id)) {
            type = Token.Keyword;
        } else if (id === 'null') {
            type = Token.NullLiteral;
        } else if (id === 'true' || id === 'false') {
            type = Token.BooleanLiteral;
        } else {
            type = Token.Identifier;
        }

        return {
            type: type,
            value: id,
            lineNumber: lineNumber,
            lineStart: lineStart,
            start: start,
            end: index
        };
    }


    // ECMA-262 11.7 Punctuators

    function scanPunctuator() {
        var token, str;

        token = {
            type: Token.Punctuator,
            value: '',
            lineNumber: lineNumber,
            lineStart: lineStart,
            start: index,
            end: index
        };

        // Check for most common single-character punctuators.
        str = source[index];
        switch (str) {

        case '(':
            if (extra.tokenize) {
                extra.openParenToken = extra.tokenValues.length;
            }
            ++index;
            break;

        case '{':
            if (extra.tokenize) {
                extra.openCurlyToken = extra.tokenValues.length;
            }
            state.curlyStack.push('{');
            ++index;
            break;

        case '.':
            ++index;
            if (source[index] === '.' && source[index + 1] === '.') {
                // Spread operator: ...
                index += 2;
                str = '...';
            }
            break;

        case '}':
            ++index;
            state.curlyStack.pop();
            break;
        case ')':
        case ';':
        case ',':
        case '[':
        case ']':
        case ':':
        case '?':
        case '~':
            ++index;
            break;

        default:
            // 4-character punctuator.
            str = source.substr(index, 4);
            if (str === '>>>=') {
                index += 4;
            } else {

                // 3-character punctuators.
                str = str.substr(0, 3);
                if (str === '===' || str === '!==' || str === '>>>' ||
                    str === '<<=' || str === '>>=') {
                    index += 3;
                } else {

                    // 2-character punctuators.
                    str = str.substr(0, 2);
                    if (str === '&&' || str === '||' || str === '==' || str === '!=' ||
                        str === '+=' || str === '-=' || str === '*=' || str === '/=' ||
                        str === '++' || str === '--' || str === '<<' || str === '>>' ||
                        str === '&=' || str === '|=' || str === '^=' || str === '%=' ||
                        str === '<=' || str === '>=' || str === '=>') {
                        index += 2;
                    } else {

                        // 1-character punctuators.
                        str = source[index];
                        if ('<>=!+-*%&|^/'.indexOf(str) >= 0) {
                            ++index;
                        }
                    }
                }
            }
        }

        if (index === token.start) {
            throwUnexpectedToken();
        }

        token.end = index;
        token.value = str;
        return token;
    }

    // ECMA-262 11.8.3 Numeric Literals

    function scanHexLiteral(start) {
        var number = '';

        while (index < length) {
            if (!isHexDigit(source[index])) {
                break;
            }
            number += source[index++];
        }

        if (number.length === 0) {
            throwUnexpectedToken();
        }

        if (isIdentifierStart(source.charCodeAt(index))) {
            throwUnexpectedToken();
        }

        return {
            type: Token.NumericLiteral,
            value: parseInt('0x' + number, 16),
            lineNumber: lineNumber,
            lineStart: lineStart,
            start: start,
            end: index
        };
    }

    function scanBinaryLiteral(start) {
        var ch, number;

        number = '';

        while (index < length) {
            ch = source[index];
            if (ch !== '0' && ch !== '1') {
                break;
            }
            number += source[index++];
        }

        if (number.length === 0) {
            // only 0b or 0B
            throwUnexpectedToken();
        }

        if (index < length) {
            ch = source.charCodeAt(index);
            /* istanbul ignore else */
            if (isIdentifierStart(ch) || isDecimalDigit(ch)) {
                throwUnexpectedToken();
            }
        }

        return {
            type: Token.NumericLiteral,
            value: parseInt(number, 2),
            lineNumber: lineNumber,
            lineStart: lineStart,
            start: start,
            end: index
        };
    }

    function scanOctalLiteral(prefix, start) {
        var number, octal;

        if (isOctalDigit(prefix)) {
            octal = true;
            number = '0' + source[index++];
        } else {
            octal = false;
            ++index;
            number = '';
        }

        while (index < length) {
            if (!isOctalDigit(source[index])) {
                break;
            }
            number += source[index++];
        }

        if (!octal && number.length === 0) {
            // only 0o or 0O
            throwUnexpectedToken();
        }

        if (isIdentifierStart(source.charCodeAt(index)) || isDecimalDigit(source.charCodeAt(index))) {
            throwUnexpectedToken();
        }

        return {
            type: Token.NumericLiteral,
            value: parseInt(number, 8),
            octal: octal,
            lineNumber: lineNumber,
            lineStart: lineStart,
            start: start,
            end: index
        };
    }

    function isImplicitOctalLiteral() {
        var i, ch;

        // Implicit octal, unless there is a non-octal digit.
        // (Annex B.1.1 on Numeric Literals)
        for (i = index + 1; i < length; ++i) {
            ch = source[i];
            if (ch === '8' || ch === '9') {
                return false;
            }
            if (!isOctalDigit(ch)) {
                return true;
            }
        }

        return true;
    }

    function scanNumericLiteral() {
        var number, start, ch;

        ch = source[index];
        assert(isDecimalDigit(ch.charCodeAt(0)) || (ch === '.'),
            'Numeric literal must start with a decimal digit or a decimal point');

        start = index;
        number = '';
        if (ch !== '.') {
            number = source[index++];
            ch = source[index];

            // Hex number starts with '0x'.
            // Octal number starts with '0'.
            // Octal number in ES6 starts with '0o'.
            // Binary number in ES6 starts with '0b'.
            if (number === '0') {
                if (ch === 'x' || ch === 'X') {
                    ++index;
                    return scanHexLiteral(start);
                }
                if (ch === 'b' || ch === 'B') {
                    ++index;
                    return scanBinaryLiteral(start);
                }
                if (ch === 'o' || ch === 'O') {
                    return scanOctalLiteral(ch, start);
                }

                if (isOctalDigit(ch)) {
                    if (isImplicitOctalLiteral()) {
                        return scanOctalLiteral(ch, start);
                    }
                }
            }

            while (isDecimalDigit(source.charCodeAt(index))) {
                number += source[index++];
            }
            ch = source[index];
        }

        if (ch === '.') {
            number += source[index++];
            while (isDecimalDigit(source.charCodeAt(index))) {
                number += source[index++];
            }
            ch = source[index];
        }

        if (ch === 'e' || ch === 'E') {
            number += source[index++];

            ch = source[index];
            if (ch === '+' || ch === '-') {
                number += source[index++];
            }
            if (isDecimalDigit(source.charCodeAt(index))) {
                while (isDecimalDigit(source.charCodeAt(index))) {
                    number += source[index++];
                }
            } else {
                throwUnexpectedToken();
            }
        }

        if (isIdentifierStart(source.charCodeAt(index))) {
            throwUnexpectedToken();
        }

        return {
            type: Token.NumericLiteral,
            value: parseFloat(number),
            lineNumber: lineNumber,
            lineStart: lineStart,
            start: start,
            end: index
        };
    }

    // ECMA-262 11.8.4 String Literals

    function scanStringLiteral() {
        var str = '', quote, start, ch, unescaped, octToDec, octal = false;

        quote = source[index];
        assert((quote === '\'' || quote === '"'),
            'String literal must starts with a quote');

        start = index;
        ++index;

        while (index < length) {
            ch = source[index++];

            if (ch === quote) {
                quote = '';
                break;
            } else if (ch === '\\') {
                ch = source[index++];
                if (!ch || !isLineTerminator(ch.charCodeAt(0))) {
                    switch (ch) {
                    case 'u':
                    case 'x':
                        if (source[index] === '{') {
                            ++index;
                            str += scanUnicodeCodePointEscape();
                        } else {
                            unescaped = scanHexEscape(ch);
                            if (!unescaped) {
                                throw throwUnexpectedToken();
                            }
                            str += unescaped;
                        }
                        break;
                    case 'n':
                        str += '\n';
                        break;
                    case 'r':
                        str += '\r';
                        break;
                    case 't':
                        str += '\t';
                        break;
                    case 'b':
                        str += '\b';
                        break;
                    case 'f':
                        str += '\f';
                        break;
                    case 'v':
                        str += '\x0B';
                        break;
                    case '8':
                    case '9':
                        str += ch;
                        tolerateUnexpectedToken();
                        break;

                    default:
                        if (isOctalDigit(ch)) {
                            octToDec = octalToDecimal(ch);

                            octal = octToDec.octal || octal;
                            str += String.fromCharCode(octToDec.code);
                        } else {
                            str += ch;
                        }
                        break;
                    }
                } else {
                    ++lineNumber;
                    if (ch === '\r' && source[index] === '\n') {
                        ++index;
                    }
                    lineStart = index;
                }
            } else if (isLineTerminator(ch.charCodeAt(0))) {
                break;
            } else {
                str += ch;
            }
        }

        if (quote !== '') {
            index = start;
            throwUnexpectedToken();
        }

        return {
            type: Token.StringLiteral,
            value: str,
            octal: octal,
            lineNumber: startLineNumber,
            lineStart: startLineStart,
            start: start,
            end: index
        };
    }

    // ECMA-262 11.8.6 Template Literal Lexical Components

    function scanTemplate() {
        var cooked = '', ch, start, rawOffset, terminated, head, tail, restore, unescaped;

        terminated = false;
        tail = false;
        start = index;
        head = (source[index] === '`');
        rawOffset = 2;

        ++index;

        while (index < length) {
            ch = source[index++];
            if (ch === '`') {
                rawOffset = 1;
                tail = true;
                terminated = true;
                break;
            } else if (ch === '$') {
                if (source[index] === '{') {
                    state.curlyStack.push('${');
                    ++index;
                    terminated = true;
                    break;
                }
                cooked += ch;
            } else if (ch === '\\') {
                ch = source[index++];
                if (!isLineTerminator(ch.charCodeAt(0))) {
                    switch (ch) {
                    case 'n':
                        cooked += '\n';
                        break;
                    case 'r':
                        cooked += '\r';
                        break;
                    case 't':
                        cooked += '\t';
                        break;
                    case 'u':
                    case 'x':
                        if (source[index] === '{') {
                            ++index;
                            cooked += scanUnicodeCodePointEscape();
                        } else {
                            restore = index;
                            unescaped = scanHexEscape(ch);
                            if (unescaped) {
                                cooked += unescaped;
                            } else {
                                index = restore;
                                cooked += ch;
                            }
                        }
                        break;
                    case 'b':
                        cooked += '\b';
                        break;
                    case 'f':
                        cooked += '\f';
                        break;
                    case 'v':
                        cooked += '\v';
                        break;

                    default:
                        if (ch === '0') {
                            if (isDecimalDigit(source.charCodeAt(index))) {
                                // Illegal: \01 \02 and so on
                                throwError(Messages.TemplateOctalLiteral);
                            }
                            cooked += '\0';
                        } else if (isOctalDigit(ch)) {
                            // Illegal: \1 \2
                            throwError(Messages.TemplateOctalLiteral);
                        } else {
                            cooked += ch;
                        }
                        break;
                    }
                } else {
                    ++lineNumber;
                    if (ch === '\r' && source[index] === '\n') {
                        ++index;
                    }
                    lineStart = index;
                }
            } else if (isLineTerminator(ch.charCodeAt(0))) {
                ++lineNumber;
                if (ch === '\r' && source[index] === '\n') {
                    ++index;
                }
                lineStart = index;
                cooked += '\n';
            } else {
                cooked += ch;
            }
        }

        if (!terminated) {
            throwUnexpectedToken();
        }

        if (!head) {
            state.curlyStack.pop();
        }

        return {
            type: Token.Template,
            value: {
                cooked: cooked,
                raw: source.slice(start + 1, index - rawOffset)
            },
            head: head,
            tail: tail,
            lineNumber: lineNumber,
            lineStart: lineStart,
            start: start,
            end: index
        };
    }

    // ECMA-262 11.8.5 Regular Expression Literals

    function testRegExp(pattern, flags) {
        // The BMP character to use as a replacement for astral symbols when
        // translating an ES6 "u"-flagged pattern to an ES5-compatible
        // approximation.
        // Note: replacing with '\uFFFF' enables false positives in unlikely
        // scenarios. For example, `[\u{1044f}-\u{10440}]` is an invalid
        // pattern that would not be detected by this substitution.
        var astralSubstitute = '\uFFFF',
            tmp = pattern;

        if (flags.indexOf('u') >= 0) {
            tmp = tmp
                // Replace every Unicode escape sequence with the equivalent
                // BMP character or a constant ASCII code point in the case of
                // astral symbols. (See the above note on `astralSubstitute`
                // for more information.)
                .replace(/\\u\{([0-9a-fA-F]+)\}|\\u([a-fA-F0-9]{4})/g, function ($0, $1, $2) {
                    var codePoint = parseInt($1 || $2, 16);
                    if (codePoint > 0x10FFFF) {
                        throwUnexpectedToken(null, Messages.InvalidRegExp);
                    }
                    if (codePoint <= 0xFFFF) {
                        return String.fromCharCode(codePoint);
                    }
                    return astralSubstitute;
                })
                // Replace each paired surrogate with a single ASCII symbol to
                // avoid throwing on regular expressions that are only valid in
                // combination with the "u" flag.
                .replace(
                    /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
                    astralSubstitute
                );
        }

        // First, detect invalid regular expressions.
        try {
            
        } catch (e) {
            throwUnexpectedToken(null, Messages.InvalidRegExp);
        }

        // Return a regular expression object for this pattern-flag pair, or
        // `null` in case the current environment doesn't support the flags it
        // uses.
        try {
            return new RegExp(pattern, flags);
        } catch (exception) {
            /* istanbul ignore next */
            return null;
        }
    }

    function scanRegExpBody() {
        var ch, str, classMarker, terminated, body;

        ch = source[index];
        assert(ch === '/', 'Regular expression literal must start with a slash');
        str = source[index++];

        classMarker = false;
        terminated = false;
        while (index < length) {
            ch = source[index++];
            str += ch;
            if (ch === '\\') {
                ch = source[index++];
                // ECMA-262 7.8.5
                if (isLineTerminator(ch.charCodeAt(0))) {
                    throwUnexpectedToken(null, Messages.UnterminatedRegExp);
                }
                str += ch;
            } else if (isLineTerminator(ch.charCodeAt(0))) {
                throwUnexpectedToken(null, Messages.UnterminatedRegExp);
            } else if (classMarker) {
                if (ch === ']') {
                    classMarker = false;
                }
            } else {
                if (ch === '/') {
                    terminated = true;
                    break;
                } else if (ch === '[') {
                    classMarker = true;
                }
            }
        }

        if (!terminated) {
            throwUnexpectedToken(null, Messages.UnterminatedRegExp);
        }

        // Exclude leading and trailing slash.
        body = str.substr(1, str.length - 2);
        return {
            value: body,
            literal: str
        };
    }

    function scanRegExpFlags() {
        var ch, str, flags, restore;

        str = '';
        flags = '';
        while (index < length) {
            ch = source[index];
            if (!isIdentifierPart(ch.charCodeAt(0))) {
                break;
            }

            ++index;
            if (ch === '\\' && index < length) {
                ch = source[index];
                if (ch === 'u') {
                    ++index;
                    restore = index;
                    ch = scanHexEscape('u');
                    if (ch) {
                        flags += ch;
                        for (str += '\\u'; restore < index; ++restore) {
                            str += source[restore];
                        }
                    } else {
                        index = restore;
                        flags += 'u';
                        str += '\\u';
                    }
                    tolerateUnexpectedToken();
                } else {
                    str += '\\';
                    tolerateUnexpectedToken();
                }
            } else {
                flags += ch;
                str += ch;
            }
        }

        return {
            value: flags,
            literal: str
        };
    }

    function scanRegExp() {
        var start, body, flags, value;
        scanning = true;

        lookahead = null;
        skipComment();
        start = index;

        body = scanRegExpBody();
        flags = scanRegExpFlags();
        value = testRegExp(body.value, flags.value);
        scanning = false;
        if (extra.tokenize) {
            return {
                type: Token.RegularExpression,
                value: value,
                regex: {
                    pattern: body.value,
                    flags: flags.value
                },
                lineNumber: lineNumber,
                lineStart: lineStart,
                start: start,
                end: index
            };
        }

        return {
            literal: body.literal + flags.literal,
            value: value,
            regex: {
                pattern: body.value,
                flags: flags.value
            },
            start: start,
            end: index
        };
    }

    function collectRegex() {
        var pos, loc, regex, token;

        skipComment();

        pos = index;
        loc = {
            start: {
                line: lineNumber,
                column: index - lineStart
            }
        };

        regex = scanRegExp();

        loc.end = {
            line: lineNumber,
            column: index - lineStart
        };

        /* istanbul ignore next */
        if (!extra.tokenize) {
            // Pop the previous token, which is likely '/' or '/='
            if (extra.tokens.length > 0) {
                token = extra.tokens[extra.tokens.length - 1];
                if (token.range[0] === pos && token.type === 'Punctuator') {
                    if (token.value === '/' || token.value === '/=') {
                        extra.tokens.pop();
                    }
                }
            }

            extra.tokens.push({
                type: 'RegularExpression',
                value: regex.literal,
                regex: regex.regex,
                range: [pos, index],
                loc: loc
            });
        }

        return regex;
    }

    function isIdentifierName(token) {
        return token.type === Token.Identifier ||
            token.type === Token.Keyword ||
            token.type === Token.BooleanLiteral ||
            token.type === Token.NullLiteral;
    }

    // Using the following algorithm:
    // https://github.com/mozilla/sweet.js/wiki/design

    function advanceSlash() {
        var regex, previous, check;

        function testKeyword(value) {
            return value && (value.length > 1) && (value[0] >= 'a') && (value[0] <= 'z');
        }

        previous = extra.tokenValues[extra.tokenValues.length - 1];
        regex = (previous !== null);

        switch (previous) {
        case 'this':
        case ']':
            regex = false;
            break;

        case ')':
            check = extra.tokenValues[extra.openParenToken - 1];
            regex = (check === 'if' || check === 'while' || check === 'for' || check === 'with');
            break;

        case '}':
            // Dividing a function by anything makes little sense,
            // but we have to check for that.
            regex = false;
            if (testKeyword(extra.tokenValues[extra.openCurlyToken - 3])) {
                // Anonymous function, e.g. function(){} /42
                check = extra.tokenValues[extra.openCurlyToken - 4];
                regex = check ? (FnExprTokens.indexOf(check) < 0) : false;
            } else if (testKeyword(extra.tokenValues[extra.openCurlyToken - 4])) {
                // Named function, e.g. function f(){} /42/
                check = extra.tokenValues[extra.openCurlyToken - 5];
                regex = check ? (FnExprTokens.indexOf(check) < 0) : true;
            }
        }

        return regex ? collectRegex() : scanPunctuator();
    }

    function advance() {
        var cp, token;

        if (index >= length) {
            return {
                type: Token.EOF,
                lineNumber: lineNumber,
                lineStart: lineStart,
                start: index,
                end: index
            };
        }

        cp = source.charCodeAt(index);

        if (isIdentifierStart(cp)) {
            token = scanIdentifier();
            if (strict && isStrictModeReservedWord(token.value)) {
                token.type = Token.Keyword;
            }
            return token;
        }

        // Very common: ( and ) and ;
        if (cp === 0x28 || cp === 0x29 || cp === 0x3B) {
            return scanPunctuator();
        }

        // String literal starts with single quote (U+0027) or double quote (U+0022).
        if (cp === 0x27 || cp === 0x22) {
            return scanStringLiteral();
        }

        // Dot (.) U+002E can also start a floating-point number, hence the need
        // to check the next character.
        if (cp === 0x2E) {
            if (isDecimalDigit(source.charCodeAt(index + 1))) {
                return scanNumericLiteral();
            }
            return scanPunctuator();
        }

        if (isDecimalDigit(cp)) {
            return scanNumericLiteral();
        }

        // Slash (/) U+002F can also start a regex.
        if (extra.tokenize && cp === 0x2F) {
            return advanceSlash();
        }

        // Template literals start with ` (U+0060) for template head
        // or } (U+007D) for template middle or template tail.
        if (cp === 0x60 || (cp === 0x7D && state.curlyStack[state.curlyStack.length - 1] === '${')) {
            return scanTemplate();
        }

        // Possible identifier start in a surrogate pair.
        if (cp >= 0xD800 && cp < 0xDFFF) {
            cp = codePointAt(index);
            if (isIdentifierStart(cp)) {
                return scanIdentifier();
            }
        }

        return scanPunctuator();
    }

    function collectToken() {
        var loc, token, value, entry;

        loc = {
            start: {
                line: lineNumber,
                column: index - lineStart
            }
        };

        token = advance();
        loc.end = {
            line: lineNumber,
            column: index - lineStart
        };

        if (token.type !== Token.EOF) {
            value = source.slice(token.start, token.end);
            entry = {
                type: TokenName[token.type],
                value: value,
                range: [token.start, token.end],
                loc: loc
            };
            if (token.regex) {
                entry.regex = {
                    pattern: token.regex.pattern,
                    flags: token.regex.flags
                };
            }
            if (extra.tokenValues) {
                extra.tokenValues.push((entry.type === 'Punctuator' || entry.type === 'Keyword') ? entry.value : null);
            }
            if (extra.tokenize) {
                if (!extra.range) {
                    delete entry.range;
                }
                if (!extra.loc) {
                    delete entry.loc;
                }
                if (extra.delegate) {
                    entry = extra.delegate(entry);
                }
            }
            extra.tokens.push(entry);
        }

        return token;
    }

    function lex() {
        var token;
        scanning = true;

        lastIndex = index;
        lastLineNumber = lineNumber;
        lastLineStart = lineStart;

        skipComment();

        token = lookahead;

        startIndex = index;
        startLineNumber = lineNumber;
        startLineStart = lineStart;

        lookahead = (typeof extra.tokens !== 'undefined') ? collectToken() : advance();
        scanning = false;
        return token;
    }

    function peek() {
        scanning = true;

        skipComment();

        lastIndex = index;
        lastLineNumber = lineNumber;
        lastLineStart = lineStart;

        startIndex = index;
        startLineNumber = lineNumber;
        startLineStart = lineStart;

        lookahead = (typeof extra.tokens !== 'undefined') ? collectToken() : advance();
        scanning = false;
    }

    function Position() {
        this.line = startLineNumber;
        this.column = startIndex - startLineStart;
    }

    function SourceLocation() {
        this.start = new Position();
        this.end = null;
    }

    function WrappingSourceLocation(startToken) {
        this.start = {
            line: startToken.lineNumber,
            column: startToken.start - startToken.lineStart
        };
        this.end = null;
    }

    function Node() {
        if (extra.range) {
            this.range = [startIndex, 0];
        }
        if (extra.loc) {
            this.loc = new SourceLocation();
        }
    }

    function WrappingNode(startToken) {
        if (extra.range) {
            this.range = [startToken.start, 0];
        }
        if (extra.loc) {
            this.loc = new WrappingSourceLocation(startToken);
        }
    }

    WrappingNode.prototype = Node.prototype = {

        processComment: function () {
            var lastChild,
                innerComments,
                leadingComments,
                trailingComments,
                bottomRight = extra.bottomRightStack,
                i,
                comment,
                last = bottomRight[bottomRight.length - 1];

            if (this.type === Syntax.Program) {
                if (this.body.length > 0) {
                    return;
                }
            }
            /**
             * patch innnerComments for properties empty block
             * `function a() {/** comments **\/}`
             */

            if (this.type === Syntax.BlockStatement && this.body.length === 0) {
                innerComments = [];
                for (i = extra.leadingComments.length - 1; i >= 0; --i) {
                    comment = extra.leadingComments[i];
                    if (this.range[1] >= comment.range[1]) {
                        innerComments.unshift(comment);
                        extra.leadingComments.splice(i, 1);
                        extra.trailingComments.splice(i, 1);
                    }
                }
                if (innerComments.length) {
                    this.innerComments = innerComments;
                    //bottomRight.push(this);
                    return;
                }
            }

            if (extra.trailingComments.length > 0) {
                trailingComments = [];
                for (i = extra.trailingComments.length - 1; i >= 0; --i) {
                    comment = extra.trailingComments[i];
                    if (comment.range[0] >= this.range[1]) {
                        trailingComments.unshift(comment);
                        extra.trailingComments.splice(i, 1);
                    }
                }
                extra.trailingComments = [];
            } else {
                if (last && last.trailingComments && last.trailingComments[0].range[0] >= this.range[1]) {
                    trailingComments = last.trailingComments;
                    delete last.trailingComments;
                }
            }

            // Eating the stack.
            while (last && last.range[0] >= this.range[0]) {
                lastChild = bottomRight.pop();
                last = bottomRight[bottomRight.length - 1];
            }

            if (lastChild) {
                if (lastChild.leadingComments) {
                    leadingComments = [];
                    for (i = lastChild.leadingComments.length - 1; i >= 0; --i) {
                        comment = lastChild.leadingComments[i];
                        if (comment.range[1] <= this.range[0]) {
                            leadingComments.unshift(comment);
                            lastChild.leadingComments.splice(i, 1);
                        }
                    }

                    if (!lastChild.leadingComments.length) {
                        lastChild.leadingComments = undefined;
                    }
                }
            } else if (extra.leadingComments.length > 0) {
                leadingComments = [];
                for (i = extra.leadingComments.length - 1; i >= 0; --i) {
                    comment = extra.leadingComments[i];
                    if (comment.range[1] <= this.range[0]) {
                        leadingComments.unshift(comment);
                        extra.leadingComments.splice(i, 1);
                    }
                }
            }


            if (leadingComments && leadingComments.length > 0) {
                this.leadingComments = leadingComments;
            }
            if (trailingComments && trailingComments.length > 0) {
                this.trailingComments = trailingComments;
            }

            bottomRight.push(this);
        },

        finish: function () {
            if (extra.range) {
                this.range[1] = lastIndex;
            }
            if (extra.loc) {
                this.loc.end = {
                    line: lastLineNumber,
                    column: lastIndex - lastLineStart
                };
                if (extra.source) {
                    this.loc.source = extra.source;
                }
            }

            if (extra.attachComment) {
                this.processComment();
            }
        },

        finishArrayExpression: function (elements) {
            this.type = Syntax.ArrayExpression;
            this.elements = elements;
            this.finish();
            return this;
        },

        finishArrayPattern: function (elements) {
            this.type = Syntax.ArrayPattern;
            this.elements = elements;
            this.finish();
            return this;
        },

        finishArrowFunctionExpression: function (params, defaults, body, expression) {
            this.type = Syntax.ArrowFunctionExpression;
            this.id = null;
            this.params = params;
            this.defaults = defaults;
            this.body = body;
            this.generator = false;
            this.expression = expression;
            this.finish();
            return this;
        },

        finishAssignmentExpression: function (operator, left, right) {
            this.type = Syntax.AssignmentExpression;
            this.operator = operator;
            this.left = left;
            this.right = right;
            this.finish();
            return this;
        },

        finishAssignmentPattern: function (left, right) {
            this.type = Syntax.AssignmentPattern;
            this.left = left;
            this.right = right;
            this.finish();
            return this;
        },

        finishBinaryExpression: function (operator, left, right) {
            this.type = (operator === '||' || operator === '&&') ? Syntax.LogicalExpression : Syntax.BinaryExpression;
            this.operator = operator;
            this.left = left;
            this.right = right;
            this.finish();
            return this;
        },

        finishBlockStatement: function (body) {
            this.type = Syntax.BlockStatement;
            this.body = body;
            this.finish();
            return this;
        },

        finishBreakStatement: function (label) {
            this.type = Syntax.BreakStatement;
            this.label = label;
            this.finish();
            return this;
        },

        finishCallExpression: function (callee, args) {
            this.type = Syntax.CallExpression;
            this.callee = callee;
            this.arguments = args;
            this.finish();
            return this;
        },

        finishCatchClause: function (param, body) {
            this.type = Syntax.CatchClause;
            this.param = param;
            this.body = body;
            this.finish();
            return this;
        },

        finishClassBody: function (body) {
            this.type = Syntax.ClassBody;
            this.body = body;
            this.finish();
            return this;
        },

        finishClassDeclaration: function (id, superClass, body) {
            this.type = Syntax.ClassDeclaration;
            this.id = id;
            this.superClass = superClass;
            this.body = body;
            this.finish();
            return this;
        },

        finishClassExpression: function (id, superClass, body) {
            this.type = Syntax.ClassExpression;
            this.id = id;
            this.superClass = superClass;
            this.body = body;
            this.finish();
            return this;
        },

        finishConditionalExpression: function (test, consequent, alternate) {
            this.type = Syntax.ConditionalExpression;
            this.test = test;
            this.consequent = consequent;
            this.alternate = alternate;
            this.finish();
            return this;
        },

        finishContinueStatement: function (label) {
            this.type = Syntax.ContinueStatement;
            this.label = label;
            this.finish();
            return this;
        },

        finishDebuggerStatement: function () {
            this.type = Syntax.DebuggerStatement;
            this.finish();
            return this;
        },

        finishDoWhileStatement: function (body, test) {
            this.type = Syntax.DoWhileStatement;
            this.body = body;
            this.test = test;
            this.finish();
            return this;
        },

        finishEmptyStatement: function () {
            this.type = Syntax.EmptyStatement;
            this.finish();
            return this;
        },

        finishExpressionStatement: function (expression) {
            this.type = Syntax.ExpressionStatement;
            this.expression = expression;
            this.finish();
            return this;
        },

        finishForStatement: function (init, test, update, body) {
            this.type = Syntax.ForStatement;
            this.init = init;
            this.test = test;
            this.update = update;
            this.body = body;
            this.finish();
            return this;
        },

        finishForOfStatement: function (left, right, body) {
            this.type = Syntax.ForOfStatement;
            this.left = left;
            this.right = right;
            this.body = body;
            this.finish();
            return this;
        },

        finishForInStatement: function (left, right, body) {
            this.type = Syntax.ForInStatement;
            this.left = left;
            this.right = right;
            this.body = body;
            this.each = false;
            this.finish();
            return this;
        },

        finishFunctionDeclaration: function (id, params, defaults, body, generator) {
            this.type = Syntax.FunctionDeclaration;
            this.id = id;
            this.params = params;
            this.defaults = defaults;
            this.body = body;
            this.generator = generator;
            this.expression = false;
            this.finish();
            return this;
        },

        finishFunctionExpression: function (id, params, defaults, body, generator) {
            this.type = Syntax.FunctionExpression;
            this.id = id;
            this.params = params;
            this.defaults = defaults;
            this.body = body;
            this.generator = generator;
            this.expression = false;
            this.finish();
            return this;
        },

        finishIdentifier: function (name) {
            this.type = Syntax.Identifier;
            this.name = name;
            this.finish();
            return this;
        },

        finishIfStatement: function (test, consequent, alternate) {
            this.type = Syntax.IfStatement;
            this.test = test;
            this.consequent = consequent;
            this.alternate = alternate;
            this.finish();
            return this;
        },

        finishLabeledStatement: function (label, body) {
            this.type = Syntax.LabeledStatement;
            this.label = label;
            this.body = body;
            this.finish();
            return this;
        },

        finishLiteral: function (token) {
            this.type = Syntax.Literal;
            this.value = token.value;
            this.raw = source.slice(token.start, token.end);
            if (token.regex) {
                this.regex = token.regex;
            }
            this.finish();
            return this;
        },

        finishMemberExpression: function (accessor, object, property) {
            this.type = Syntax.MemberExpression;
            this.computed = accessor === '[';
            this.object = object;
            this.property = property;
            this.finish();
            return this;
        },

        finishMetaProperty: function (meta, property) {
            this.type = Syntax.MetaProperty;
            this.meta = meta;
            this.property = property;
            this.finish();
            return this;
        },

        finishNewExpression: function (callee, args) {
            this.type = Syntax.NewExpression;
            this.callee = callee;
            this.arguments = args;
            this.finish();
            return this;
        },

        finishObjectExpression: function (properties) {
            this.type = Syntax.ObjectExpression;
            this.properties = properties;
            this.finish();
            return this;
        },

        finishObjectPattern: function (properties) {
            this.type = Syntax.ObjectPattern;
            this.properties = properties;
            this.finish();
            return this;
        },

        finishPostfixExpression: function (operator, argument) {
            this.type = Syntax.UpdateExpression;
            this.operator = operator;
            this.argument = argument;
            this.prefix = false;
            this.finish();
            return this;
        },

        finishProgram: function (body, sourceType) {
            this.type = Syntax.Program;
            this.body = body;
            this.sourceType = sourceType;
            this.finish();
            return this;
        },

        finishProperty: function (kind, key, computed, value, method, shorthand) {
            this.type = Syntax.Property;
            this.key = key;
            this.computed = computed;
            this.value = value;
            this.kind = kind;
            this.method = method;
            this.shorthand = shorthand;
            this.finish();
            return this;
        },

        finishRestElement: function (argument) {
            this.type = Syntax.RestElement;
            this.argument = argument;
            this.finish();
            return this;
        },

        finishReturnStatement: function (argument) {
            this.type = Syntax.ReturnStatement;
            this.argument = argument;
            this.finish();
            return this;
        },

        finishSequenceExpression: function (expressions) {
            this.type = Syntax.SequenceExpression;
            this.expressions = expressions;
            this.finish();
            return this;
        },

        finishSpreadElement: function (argument) {
            this.type = Syntax.SpreadElement;
            this.argument = argument;
            this.finish();
            return this;
        },

        finishSwitchCase: function (test, consequent) {
            this.type = Syntax.SwitchCase;
            this.test = test;
            this.consequent = consequent;
            this.finish();
            return this;
        },

        finishSuper: function () {
            this.type = Syntax.Super;
            this.finish();
            return this;
        },

        finishSwitchStatement: function (discriminant, cases) {
            this.type = Syntax.SwitchStatement;
            this.discriminant = discriminant;
            this.cases = cases;
            this.finish();
            return this;
        },

        finishTaggedTemplateExpression: function (tag, quasi) {
            this.type = Syntax.TaggedTemplateExpression;
            this.tag = tag;
            this.quasi = quasi;
            this.finish();
            return this;
        },

        finishTemplateElement: function (value, tail) {
            this.type = Syntax.TemplateElement;
            this.value = value;
            this.tail = tail;
            this.finish();
            return this;
        },

        finishTemplateLiteral: function (quasis, expressions) {
            this.type = Syntax.TemplateLiteral;
            this.quasis = quasis;
            this.expressions = expressions;
            this.finish();
            return this;
        },

        finishThisExpression: function () {
            this.type = Syntax.ThisExpression;
            this.finish();
            return this;
        },

        finishThrowStatement: function (argument) {
            this.type = Syntax.ThrowStatement;
            this.argument = argument;
            this.finish();
            return this;
        },

        finishTryStatement: function (block, handler, finalizer) {
            this.type = Syntax.TryStatement;
            this.block = block;
            this.guardedHandlers = [];
            this.handlers = handler ? [handler] : [];
            this.handler = handler;
            this.finalizer = finalizer;
            this.finish();
            return this;
        },

        finishUnaryExpression: function (operator, argument) {
            this.type = (operator === '++' || operator === '--') ? Syntax.UpdateExpression : Syntax.UnaryExpression;
            this.operator = operator;
            this.argument = argument;
            this.prefix = true;
            this.finish();
            return this;
        },

        finishVariableDeclaration: function (declarations) {
            this.type = Syntax.VariableDeclaration;
            this.declarations = declarations;
            this.kind = 'var';
            this.finish();
            return this;
        },

        finishLexicalDeclaration: function (declarations, kind) {
            this.type = Syntax.VariableDeclaration;
            this.declarations = declarations;
            this.kind = kind;
            this.finish();
            return this;
        },

        finishVariableDeclarator: function (id, init) {
            this.type = Syntax.VariableDeclarator;
            this.id = id;
            this.init = init;
            this.finish();
            return this;
        },

        finishWhileStatement: function (test, body) {
            this.type = Syntax.WhileStatement;
            this.test = test;
            this.body = body;
            this.finish();
            return this;
        },

        finishWithStatement: function (object, body) {
            this.type = Syntax.WithStatement;
            this.object = object;
            this.body = body;
            this.finish();
            return this;
        },

        finishExportSpecifier: function (local, exported) {
            this.type = Syntax.ExportSpecifier;
            this.exported = exported || local;
            this.local = local;
            this.finish();
            return this;
        },

        finishImportDefaultSpecifier: function (local) {
            this.type = Syntax.ImportDefaultSpecifier;
            this.local = local;
            this.finish();
            return this;
        },

        finishImportNamespaceSpecifier: function (local) {
            this.type = Syntax.ImportNamespaceSpecifier;
            this.local = local;
            this.finish();
            return this;
        },

        finishExportNamedDeclaration: function (declaration, specifiers, src) {
            this.type = Syntax.ExportNamedDeclaration;
            this.declaration = declaration;
            this.specifiers = specifiers;
            this.source = src;
            this.finish();
            return this;
        },

        finishExportDefaultDeclaration: function (declaration) {
            this.type = Syntax.ExportDefaultDeclaration;
            this.declaration = declaration;
            this.finish();
            return this;
        },

        finishExportAllDeclaration: function (src) {
            this.type = Syntax.ExportAllDeclaration;
            this.source = src;
            this.finish();
            return this;
        },

        finishImportSpecifier: function (local, imported) {
            this.type = Syntax.ImportSpecifier;
            this.local = local || imported;
            this.imported = imported;
            this.finish();
            return this;
        },

        finishImportDeclaration: function (specifiers, src) {
            this.type = Syntax.ImportDeclaration;
            this.specifiers = specifiers;
            this.source = src;
            this.finish();
            return this;
        },

        finishYieldExpression: function (argument, delegate) {
            this.type = Syntax.YieldExpression;
            this.argument = argument;
            this.delegate = delegate;
            this.finish();
            return this;
        }
    };


    function recordError(error) {
        var e, existing;

        for (e = 0; e < extra.errors.length; e++) {
            existing = extra.errors[e];
            // Prevent duplicated error.
            /* istanbul ignore next */
            if (existing.index === error.index && existing.message === error.message) {
                return;
            }
        }

        extra.errors.push(error);
    }

    function constructError(msg, column) {
        var error = new Error(msg);
        try {
            throw error;
        } catch (base) {
            /* istanbul ignore else */
            if (Object.create && Object.defineProperty) {
                error = Object.create(base);
                Object.defineProperty(error, 'column', { value: column });
            }
        } finally {
            return error;
        }
    }

    function createError(line, pos, description) {
        var msg, column, error;

        msg = 'Line ' + line + ': ' + description;
        column = pos - (scanning ? lineStart : lastLineStart) + 1;
        error = constructError(msg, column);
        error.lineNumber = line;
        error.description = description;
        error.index = pos;
        return error;
    }

    // Throw an exception

    function throwError(messageFormat) {
        var args, msg;

        args = Array.prototype.slice.call(arguments, 1);
        msg = messageFormat.replace(/%(\d)/g,
            function (whole, idx) {
                assert(idx < args.length, 'Message reference must be in range');
                return args[idx];
            }
        );

        throw createError(lastLineNumber, lastIndex, msg);
    }

    function tolerateError(messageFormat) {
        var args, msg, error;

        args = Array.prototype.slice.call(arguments, 1);
        /* istanbul ignore next */
        msg = messageFormat.replace(/%(\d)/g,
            function (whole, idx) {
                assert(idx < args.length, 'Message reference must be in range');
                return args[idx];
            }
        );

        error = createError(lineNumber, lastIndex, msg);
        if (extra.errors) {
            recordError(error);
        } else {
            throw error;
        }
    }

    // Throw an exception because of the token.

    function unexpectedTokenError(token, message) {
        var value, msg = message || Messages.UnexpectedToken;

        if (token) {
            if (!message) {
                msg = (token.type === Token.EOF) ? Messages.UnexpectedEOS :
                    (token.type === Token.Identifier) ? Messages.UnexpectedIdentifier :
                    (token.type === Token.NumericLiteral) ? Messages.UnexpectedNumber :
                    (token.type === Token.StringLiteral) ? Messages.UnexpectedString :
                    (token.type === Token.Template) ? Messages.UnexpectedTemplate :
                    Messages.UnexpectedToken;

                if (token.type === Token.Keyword) {
                    if (isFutureReservedWord(token.value)) {
                        msg = Messages.UnexpectedReserved;
                    } else if (strict && isStrictModeReservedWord(token.value)) {
                        msg = Messages.StrictReservedWord;
                    }
                }
            }

            value = (token.type === Token.Template) ? token.value.raw : token.value;
        } else {
            value = 'ILLEGAL';
        }

        msg = msg.replace('%0', value);

        return (token && typeof token.lineNumber === 'number') ?
            createError(token.lineNumber, token.start, msg) :
            createError(scanning ? lineNumber : lastLineNumber, scanning ? index : lastIndex, msg);
    }

    function throwUnexpectedToken(token, message) {
        throw unexpectedTokenError(token, message);
    }

    function tolerateUnexpectedToken(token, message) {
        var error = unexpectedTokenError(token, message);
        if (extra.errors) {
            recordError(error);
        } else {
            throw error;
        }
    }

    // Expect the next token to match the specified punctuator.
    // If not, an exception will be thrown.

    function expect(value) {
        var token = lex();
        if (token.type !== Token.Punctuator || token.value !== value) {
            throwUnexpectedToken(token);
        }
    }

    /**
     * @name expectCommaSeparator
     * @description Quietly expect a comma when in tolerant mode, otherwise delegates
     * to <code>expect(value)</code>
     * @since 2.0
     */
    function expectCommaSeparator() {
        var token;

        if (extra.errors) {
            token = lookahead;
            if (token.type === Token.Punctuator && token.value === ',') {
                lex();
            } else if (token.type === Token.Punctuator && token.value === ';') {
                lex();
                tolerateUnexpectedToken(token);
            } else {
                tolerateUnexpectedToken(token, Messages.UnexpectedToken);
            }
        } else {
            expect(',');
        }
    }

    // Expect the next token to match the specified keyword.
    // If not, an exception will be thrown.

    function expectKeyword(keyword) {
        var token = lex();
        if (token.type !== Token.Keyword || token.value !== keyword) {
            throwUnexpectedToken(token);
        }
    }

    // Return true if the next token matches the specified punctuator.

    function match(value) {
        return lookahead.type === Token.Punctuator && lookahead.value === value;
    }

    // Return true if the next token matches the specified keyword

    function matchKeyword(keyword) {
        return lookahead.type === Token.Keyword && lookahead.value === keyword;
    }

    // Return true if the next token matches the specified contextual keyword
    // (where an identifier is sometimes a keyword depending on the context)

    function matchContextualKeyword(keyword) {
        return lookahead.type === Token.Identifier && lookahead.value === keyword;
    }

    // Return true if the next token is an assignment operator

    function matchAssign() {
        var op;

        if (lookahead.type !== Token.Punctuator) {
            return false;
        }
        op = lookahead.value;
        return op === '=' ||
            op === '*=' ||
            op === '/=' ||
            op === '%=' ||
            op === '+=' ||
            op === '-=' ||
            op === '<<=' ||
            op === '>>=' ||
            op === '>>>=' ||
            op === '&=' ||
            op === '^=' ||
            op === '|=';
    }

    function consumeSemicolon() {
        // Catch the very common case first: immediately a semicolon (U+003B).
        if (source.charCodeAt(startIndex) === 0x3B || match(';')) {
            lex();
            return;
        }

        if (hasLineTerminator) {
            return;
        }

        // FIXME(ikarienator): this is seemingly an issue in the previous location info convention.
        lastIndex = startIndex;
        lastLineNumber = startLineNumber;
        lastLineStart = startLineStart;

        if (lookahead.type !== Token.EOF && !match('}')) {
            throwUnexpectedToken(lookahead);
        }
    }

    // Cover grammar support.
    //
    // When an assignment expression position starts with an left parenthesis, the determination of the type
    // of the syntax is to be deferred arbitrarily long until the end of the parentheses pair (plus a lookahead)
    // or the first comma. This situation also defers the determination of all the expressions nested in the pair.
    //
    // There are three productions that can be parsed in a parentheses pair that needs to be determined
    // after the outermost pair is closed. They are:
    //
    //   1. AssignmentExpression
    //   2. BindingElements
    //   3. AssignmentTargets
    //
    // In order to avoid exponential backtracking, we use two flags to denote if the production can be
    // binding element or assignment target.
    //
    // The three productions have the relationship:
    //
    //   BindingElements ⊆ AssignmentTargets ⊆ AssignmentExpression
    //
    // with a single exception that CoverInitializedName when used directly in an Expression, generates
    // an early error. Therefore, we need the third state, firstCoverInitializedNameError, to track the
    // first usage of CoverInitializedName and report it when we reached the end of the parentheses pair.
    //
    // isolateCoverGrammar function runs the given parser function with a new cover grammar context, and it does not
    // effect the current flags. This means the production the parser parses is only used as an expression. Therefore
    // the CoverInitializedName check is conducted.
    //
    // inheritCoverGrammar function runs the given parse function with a new cover grammar context, and it propagates
    // the flags outside of the parser. This means the production the parser parses is used as a part of a potential
    // pattern. The CoverInitializedName check is deferred.
    function isolateCoverGrammar(parser) {
        var oldIsBindingElement = isBindingElement,
            oldIsAssignmentTarget = isAssignmentTarget,
            oldFirstCoverInitializedNameError = firstCoverInitializedNameError,
            result;
        isBindingElement = true;
        isAssignmentTarget = true;
        firstCoverInitializedNameError = null;
        result = parser();
        if (firstCoverInitializedNameError !== null) {
            throwUnexpectedToken(firstCoverInitializedNameError);
        }
        isBindingElement = oldIsBindingElement;
        isAssignmentTarget = oldIsAssignmentTarget;
        firstCoverInitializedNameError = oldFirstCoverInitializedNameError;
        return result;
    }

    function inheritCoverGrammar(parser) {
        var oldIsBindingElement = isBindingElement,
            oldIsAssignmentTarget = isAssignmentTarget,
            oldFirstCoverInitializedNameError = firstCoverInitializedNameError,
            result;
        isBindingElement = true;
        isAssignmentTarget = true;
        firstCoverInitializedNameError = null;
        result = parser();
        isBindingElement = isBindingElement && oldIsBindingElement;
        isAssignmentTarget = isAssignmentTarget && oldIsAssignmentTarget;
        firstCoverInitializedNameError = oldFirstCoverInitializedNameError || firstCoverInitializedNameError;
        return result;
    }

    // ECMA-262 13.3.3 Destructuring Binding Patterns

    function parseArrayPattern(params, kind) {
        var node = new Node(), elements = [], rest, restNode;
        expect('[');

        while (!match(']')) {
            if (match(',')) {
                lex();
                elements.push(null);
            } else {
                if (match('...')) {
                    restNode = new Node();
                    lex();
                    params.push(lookahead);
                    rest = parseVariableIdentifier(kind);
                    elements.push(restNode.finishRestElement(rest));
                    break;
                } else {
                    elements.push(parsePatternWithDefault(params, kind));
                }
                if (!match(']')) {
                    expect(',');
                }
            }

        }

        expect(']');

        return node.finishArrayPattern(elements);
    }

    function parsePropertyPattern(params, kind) {
        var node = new Node(), key, keyToken, computed = match('['), init;
        if (lookahead.type === Token.Identifier) {
            keyToken = lookahead;
            key = parseVariableIdentifier();
            if (match('=')) {
                params.push(keyToken);
                lex();
                init = parseAssignmentExpression();

                return node.finishProperty(
                    'init', key, false,
                    new WrappingNode(keyToken).finishAssignmentPattern(key, init), false, true);
            } else if (!match(':')) {
                params.push(keyToken);
                return node.finishProperty('init', key, false, key, false, true);
            }
        } else {
            key = parseObjectPropertyKey();
        }
        expect(':');
        init = parsePatternWithDefault(params, kind);
        return node.finishProperty('init', key, computed, init, false, false);
    }

    function parseObjectPattern(params, kind) {
        var node = new Node(), properties = [];

        expect('{');

        while (!match('}')) {
            properties.push(parsePropertyPattern(params, kind));
            if (!match('}')) {
                expect(',');
            }
        }

        lex();

        return node.finishObjectPattern(properties);
    }

    function parsePattern(params, kind) {
        if (match('[')) {
            return parseArrayPattern(params, kind);
        } else if (match('{')) {
            return parseObjectPattern(params, kind);
        } else if (matchKeyword('let')) {
            if (kind === 'const' || kind === 'let') {
                tolerateUnexpectedToken(lookahead, Messages.UnexpectedToken);
            }
        }

        params.push(lookahead);
        return parseVariableIdentifier(kind);
    }

    function parsePatternWithDefault(params, kind) {
        var startToken = lookahead, pattern, previousAllowYield, right;
        pattern = parsePattern(params, kind);
        if (match('=')) {
            lex();
            previousAllowYield = state.allowYield;
            state.allowYield = true;
            right = isolateCoverGrammar(parseAssignmentExpression);
            state.allowYield = previousAllowYield;
            pattern = new WrappingNode(startToken).finishAssignmentPattern(pattern, right);
        }
        return pattern;
    }

    // ECMA-262 12.2.5 Array Initializer

    function parseArrayInitializer() {
        var elements = [], node = new Node(), restSpread;

        expect('[');

        while (!match(']')) {
            if (match(',')) {
                lex();
                elements.push(null);
            } else if (match('...')) {
                restSpread = new Node();
                lex();
                restSpread.finishSpreadElement(inheritCoverGrammar(parseAssignmentExpression));

                if (!match(']')) {
                    isAssignmentTarget = isBindingElement = false;
                    expect(',');
                }
                elements.push(restSpread);
            } else {
                elements.push(inheritCoverGrammar(parseAssignmentExpression));

                if (!match(']')) {
                    expect(',');
                }
            }
        }

        lex();

        return node.finishArrayExpression(elements);
    }

    // ECMA-262 12.2.6 Object Initializer

    function parsePropertyFunction(node, paramInfo, isGenerator) {
        var previousStrict, body;

        isAssignmentTarget = isBindingElement = false;

        previousStrict = strict;
        body = isolateCoverGrammar(parseFunctionSourceElements);

        if (strict && paramInfo.firstRestricted) {
            tolerateUnexpectedToken(paramInfo.firstRestricted, paramInfo.message);
        }
        if (strict && paramInfo.stricted) {
            tolerateUnexpectedToken(paramInfo.stricted, paramInfo.message);
        }

        strict = previousStrict;
        return node.finishFunctionExpression(null, paramInfo.params, paramInfo.defaults, body, isGenerator);
    }

    function parsePropertyMethodFunction() {
        var params, method, node = new Node(),
            previousAllowYield = state.allowYield;

        state.allowYield = false;
        params = parseParams();
        state.allowYield = previousAllowYield;

        state.allowYield = false;
        method = parsePropertyFunction(node, params, false);
        state.allowYield = previousAllowYield;

        return method;
    }

    function parseObjectPropertyKey() {
        var token, node = new Node(), expr;

        token = lex();

        // Note: This function is called only from parseObjectProperty(), where
        // EOF and Punctuator tokens are already filtered out.

        switch (token.type) {
        case Token.StringLiteral:
        case Token.NumericLiteral:
            if (strict && token.octal) {
                tolerateUnexpectedToken(token, Messages.StrictOctalLiteral);
            }
            return node.finishLiteral(token);
        case Token.Identifier:
        case Token.BooleanLiteral:
        case Token.NullLiteral:
        case Token.Keyword:
            return node.finishIdentifier(token.value);
        case Token.Punctuator:
            if (token.value === '[') {
                expr = isolateCoverGrammar(parseAssignmentExpression);
                expect(']');
                return expr;
            }
            break;
        }
        throwUnexpectedToken(token);
    }

    function lookaheadPropertyName() {
        switch (lookahead.type) {
        case Token.Identifier:
        case Token.StringLiteral:
        case Token.BooleanLiteral:
        case Token.NullLiteral:
        case Token.NumericLiteral:
        case Token.Keyword:
            return true;
        case Token.Punctuator:
            return lookahead.value === '[';
        }
        return false;
    }

    // This function is to try to parse a MethodDefinition as defined in 14.3. But in the case of object literals,
    // it might be called at a position where there is in fact a short hand identifier pattern or a data property.
    // This can only be determined after we consumed up to the left parentheses.
    //
    // In order to avoid back tracking, it returns `null` if the position is not a MethodDefinition and the caller
    // is responsible to visit other options.
    function tryParseMethodDefinition(token, key, computed, node) {
        var value, options, methodNode, params,
            previousAllowYield = state.allowYield;

        if (token.type === Token.Identifier) {
            // check for `get` and `set`;

            if (token.value === 'get' && lookaheadPropertyName()) {
                computed = match('[');
                key = parseObjectPropertyKey();
                methodNode = new Node();
                expect('(');
                expect(')');

                state.allowYield = false;
                value = parsePropertyFunction(methodNode, {
                    params: [],
                    defaults: [],
                    stricted: null,
                    firstRestricted: null,
                    message: null
                }, false);
                state.allowYield = previousAllowYield;

                return node.finishProperty('get', key, computed, value, false, false);
            } else if (token.value === 'set' && lookaheadPropertyName()) {
                computed = match('[');
                key = parseObjectPropertyKey();
                methodNode = new Node();
                expect('(');

                options = {
                    params: [],
                    defaultCount: 0,
                    defaults: [],
                    firstRestricted: null,
                    paramSet: {}
                };
                if (match(')')) {
                    tolerateUnexpectedToken(lookahead);
                } else {
                    state.allowYield = false;
                    parseParam(options);
                    state.allowYield = previousAllowYield;
                    if (options.defaultCount === 0) {
                        options.defaults = [];
                    }
                }
                expect(')');

                state.allowYield = false;
                value = parsePropertyFunction(methodNode, options, false);
                state.allowYield = previousAllowYield;

                return node.finishProperty('set', key, computed, value, false, false);
            }
        } else if (token.type === Token.Punctuator && token.value === '*' && lookaheadPropertyName()) {
            computed = match('[');
            key = parseObjectPropertyKey();
            methodNode = new Node();

            state.allowYield = true;
            params = parseParams();
            state.allowYield = previousAllowYield;

            state.allowYield = false;
            value = parsePropertyFunction(methodNode, params, true);
            state.allowYield = previousAllowYield;

            return node.finishProperty('init', key, computed, value, true, false);
        }

        if (key && match('(')) {
            value = parsePropertyMethodFunction();
            return node.finishProperty('init', key, computed, value, true, false);
        }

        // Not a MethodDefinition.
        return null;
    }

    function parseObjectProperty(hasProto) {
        var token = lookahead, node = new Node(), computed, key, maybeMethod, proto, value;

        computed = match('[');
        if (match('*')) {
            lex();
        } else {
            key = parseObjectPropertyKey();
        }
        maybeMethod = tryParseMethodDefinition(token, key, computed, node);
        if (maybeMethod) {
            return maybeMethod;
        }

        if (!key) {
            throwUnexpectedToken(lookahead);
        }

        // Check for duplicated __proto__
        if (!computed) {
            proto = (key.type === Syntax.Identifier && key.name === '__proto__') ||
                (key.type === Syntax.Literal && key.value === '__proto__');
            if (hasProto.value && proto) {
                tolerateError(Messages.DuplicateProtoProperty);
            }
            hasProto.value |= proto;
        }

        if (match(':')) {
            lex();
            value = inheritCoverGrammar(parseAssignmentExpression);
            return node.finishProperty('init', key, computed, value, false, false);
        }

        if (token.type === Token.Identifier) {
            if (match('=')) {
                firstCoverInitializedNameError = lookahead;
                lex();
                value = isolateCoverGrammar(parseAssignmentExpression);
                return node.finishProperty('init', key, computed,
                    new WrappingNode(token).finishAssignmentPattern(key, value), false, true);
            }
            return node.finishProperty('init', key, computed, key, false, true);
        }

        throwUnexpectedToken(lookahead);
    }

    function parseObjectInitializer() {
        var properties = [], hasProto = {value: false}, node = new Node();

        expect('{');

        while (!match('}')) {
            properties.push(parseObjectProperty(hasProto));

            if (!match('}')) {
                expectCommaSeparator();
            }
        }

        expect('}');

        return node.finishObjectExpression(properties);
    }

    function reinterpretExpressionAsPattern(expr) {
        var i;
        switch (expr.type) {
        case Syntax.Identifier:
        case Syntax.MemberExpression:
        case Syntax.RestElement:
        case Syntax.AssignmentPattern:
            break;
        case Syntax.SpreadElement:
            expr.type = Syntax.RestElement;
            reinterpretExpressionAsPattern(expr.argument);
            break;
        case Syntax.ArrayExpression:
            expr.type = Syntax.ArrayPattern;
            for (i = 0; i < expr.elements.length; i++) {
                if (expr.elements[i] !== null) {
                    reinterpretExpressionAsPattern(expr.elements[i]);
                }
            }
            break;
        case Syntax.ObjectExpression:
            expr.type = Syntax.ObjectPattern;
            for (i = 0; i < expr.properties.length; i++) {
                reinterpretExpressionAsPattern(expr.properties[i].value);
            }
            break;
        case Syntax.AssignmentExpression:
            expr.type = Syntax.AssignmentPattern;
            reinterpretExpressionAsPattern(expr.left);
            break;
        default:
            // Allow other node type for tolerant parsing.
            break;
        }
    }

    // ECMA-262 12.2.9 Template Literals

    function parseTemplateElement(option) {
        var node, token;

        if (lookahead.type !== Token.Template || (option.head && !lookahead.head)) {
            throwUnexpectedToken();
        }

        node = new Node();
        token = lex();

        return node.finishTemplateElement({ raw: token.value.raw, cooked: token.value.cooked }, token.tail);
    }

    function parseTemplateLiteral() {
        var quasi, quasis, expressions, node = new Node();

        quasi = parseTemplateElement({ head: true });
        quasis = [quasi];
        expressions = [];

        while (!quasi.tail) {
            expressions.push(parseExpression());
            quasi = parseTemplateElement({ head: false });
            quasis.push(quasi);
        }

        return node.finishTemplateLiteral(quasis, expressions);
    }

    // ECMA-262 12.2.10 The Grouping Operator

    function parseGroupExpression() {
        var expr, expressions, startToken, i, params = [];

        expect('(');

        if (match(')')) {
            lex();
            if (!match('=>')) {
                expect('=>');
            }
            return {
                type: PlaceHolders.ArrowParameterPlaceHolder,
                params: [],
                rawParams: []
            };
        }

        startToken = lookahead;
        if (match('...')) {
            expr = parseRestElement(params);
            expect(')');
            if (!match('=>')) {
                expect('=>');
            }
            return {
                type: PlaceHolders.ArrowParameterPlaceHolder,
                params: [expr]
            };
        }

        isBindingElement = true;
        expr = inheritCoverGrammar(parseAssignmentExpression);

        if (match(',')) {
            isAssignmentTarget = false;
            expressions = [expr];

            while (startIndex < length) {
                if (!match(',')) {
                    break;
                }
                lex();

                if (match('...')) {
                    if (!isBindingElement) {
                        throwUnexpectedToken(lookahead);
                    }
                    expressions.push(parseRestElement(params));
                    expect(')');
                    if (!match('=>')) {
                        expect('=>');
                    }
                    isBindingElement = false;
                    for (i = 0; i < expressions.length; i++) {
                        reinterpretExpressionAsPattern(expressions[i]);
                    }
                    return {
                        type: PlaceHolders.ArrowParameterPlaceHolder,
                        params: expressions
                    };
                }

                expressions.push(inheritCoverGrammar(parseAssignmentExpression));
            }

            expr = new WrappingNode(startToken).finishSequenceExpression(expressions);
        }


        expect(')');

        if (match('=>')) {
            if (expr.type === Syntax.Identifier && expr.name === 'yield') {
                return {
                    type: PlaceHolders.ArrowParameterPlaceHolder,
                    params: [expr]
                };
            }

            if (!isBindingElement) {
                throwUnexpectedToken(lookahead);
            }

            if (expr.type === Syntax.SequenceExpression) {
                for (i = 0; i < expr.expressions.length; i++) {
                    reinterpretExpressionAsPattern(expr.expressions[i]);
                }
            } else {
                reinterpretExpressionAsPattern(expr);
            }

            expr = {
                type: PlaceHolders.ArrowParameterPlaceHolder,
                params: expr.type === Syntax.SequenceExpression ? expr.expressions : [expr]
            };
        }
        isBindingElement = false;
        return expr;
    }


    // ECMA-262 12.2 Primary Expressions

    function parsePrimaryExpression() {
        var type, token, expr, node;

        if (match('(')) {
            isBindingElement = false;
            return inheritCoverGrammar(parseGroupExpression);
        }

        if (match('[')) {
            return inheritCoverGrammar(parseArrayInitializer);
        }

        if (match('{')) {
            return inheritCoverGrammar(parseObjectInitializer);
        }

        type = lookahead.type;
        node = new Node();

        if (type === Token.Identifier) {
            if (state.sourceType === 'module' && lookahead.value === 'await') {
                tolerateUnexpectedToken(lookahead);
            }
            expr = node.finishIdentifier(lex().value);
        } else if (type === Token.StringLiteral || type === Token.NumericLiteral) {
            isAssignmentTarget = isBindingElement = false;
            if (strict && lookahead.octal) {
                tolerateUnexpectedToken(lookahead, Messages.StrictOctalLiteral);
            }
            expr = node.finishLiteral(lex());
        } else if (type === Token.Keyword) {
            if (!strict && state.allowYield && matchKeyword('yield')) {
                return parseNonComputedProperty();
            }
            if (!strict && matchKeyword('let')) {
                return node.finishIdentifier(lex().value);
            }
            isAssignmentTarget = isBindingElement = false;
            if (matchKeyword('function')) {
                return parseFunctionExpression();
            }
            if (matchKeyword('this')) {
                lex();
                return node.finishThisExpression();
            }
            if (matchKeyword('class')) {
                return parseClassExpression();
            }
            throwUnexpectedToken(lex());
        } else if (type === Token.BooleanLiteral) {
            isAssignmentTarget = isBindingElement = false;
            token = lex();
            token.value = (token.value === 'true');
            expr = node.finishLiteral(token);
        } else if (type === Token.NullLiteral) {
            isAssignmentTarget = isBindingElement = false;
            token = lex();
            token.value = null;
            expr = node.finishLiteral(token);
        } else if (match('/') || match('/=')) {
            isAssignmentTarget = isBindingElement = false;
            index = startIndex;

            if (typeof extra.tokens !== 'undefined') {
                token = collectRegex();
            } else {
                token = scanRegExp();
            }
            lex();
            expr = node.finishLiteral(token);
        } else if (type === Token.Template) {
            expr = parseTemplateLiteral();
        } else {
            throwUnexpectedToken(lex());
        }

        return expr;
    }

    // ECMA-262 12.3 Left-Hand-Side Expressions

    function parseArguments() {
        var args = [], expr;

        expect('(');

        if (!match(')')) {
            while (startIndex < length) {
                if (match('...')) {
                    expr = new Node();
                    lex();
                    expr.finishSpreadElement(isolateCoverGrammar(parseAssignmentExpression));
                } else {
                    expr = isolateCoverGrammar(parseAssignmentExpression);
                }
                args.push(expr);
                if (match(')')) {
                    break;
                }
                expectCommaSeparator();
            }
        }

        expect(')');

        return args;
    }

    function parseNonComputedProperty() {
        var token, node = new Node();

        token = lex();

        if (!isIdentifierName(token)) {
            throwUnexpectedToken(token);
        }

        return node.finishIdentifier(token.value);
    }

    function parseNonComputedMember() {
        expect('.');

        return parseNonComputedProperty();
    }

    function parseComputedMember() {
        var expr;

        expect('[');

        expr = isolateCoverGrammar(parseExpression);

        expect(']');

        return expr;
    }

    // ECMA-262 12.3.3 The new Operator

    function parseNewExpression() {
        var callee, args, node = new Node();

        expectKeyword('new');

        if (match('.')) {
            lex();
            if (lookahead.type === Token.Identifier && lookahead.value === 'target') {
                if (state.inFunctionBody) {
                    lex();
                    return node.finishMetaProperty('new', 'target');
                }
            }
            throwUnexpectedToken(lookahead);
        }

        callee = isolateCoverGrammar(parseLeftHandSideExpression);
        args = match('(') ? parseArguments() : [];

        isAssignmentTarget = isBindingElement = false;

        return node.finishNewExpression(callee, args);
    }

    // ECMA-262 12.3.4 Function Calls

    function parseLeftHandSideExpressionAllowCall() {
        var quasi, expr, args, property, startToken, previousAllowIn = state.allowIn;

        startToken = lookahead;
        state.allowIn = true;

        if (matchKeyword('super') && state.inFunctionBody) {
            expr = new Node();
            lex();
            expr = expr.finishSuper();
            if (!match('(') && !match('.') && !match('[')) {
                throwUnexpectedToken(lookahead);
            }
        } else {
            expr = inheritCoverGrammar(matchKeyword('new') ? parseNewExpression : parsePrimaryExpression);
        }

        for (;;) {
            if (match('.')) {
                isBindingElement = false;
                isAssignmentTarget = true;
                property = parseNonComputedMember();
                expr = new WrappingNode(startToken).finishMemberExpression('.', expr, property);
            } else if (match('(')) {
                isBindingElement = false;
                isAssignmentTarget = false;
                args = parseArguments();
                expr = new WrappingNode(startToken).finishCallExpression(expr, args);
            } else if (match('[')) {
                isBindingElement = false;
                isAssignmentTarget = true;
                property = parseComputedMember();
                expr = new WrappingNode(startToken).finishMemberExpression('[', expr, property);
            } else if (lookahead.type === Token.Template && lookahead.head) {
                quasi = parseTemplateLiteral();
                expr = new WrappingNode(startToken).finishTaggedTemplateExpression(expr, quasi);
            } else {
                break;
            }
        }
        state.allowIn = previousAllowIn;

        return expr;
    }

    // ECMA-262 12.3 Left-Hand-Side Expressions

    function parseLeftHandSideExpression() {
        var quasi, expr, property, startToken;
        assert(state.allowIn, 'callee of new expression always allow in keyword.');

        startToken = lookahead;

        if (matchKeyword('super') && state.inFunctionBody) {
            expr = new Node();
            lex();
            expr = expr.finishSuper();
            if (!match('[') && !match('.')) {
                throwUnexpectedToken(lookahead);
            }
        } else {
            expr = inheritCoverGrammar(matchKeyword('new') ? parseNewExpression : parsePrimaryExpression);
        }

        for (;;) {
            if (match('[')) {
                isBindingElement = false;
                isAssignmentTarget = true;
                property = parseComputedMember();
                expr = new WrappingNode(startToken).finishMemberExpression('[', expr, property);
            } else if (match('.')) {
                isBindingElement = false;
                isAssignmentTarget = true;
                property = parseNonComputedMember();
                expr = new WrappingNode(startToken).finishMemberExpression('.', expr, property);
            } else if (lookahead.type === Token.Template && lookahead.head) {
                quasi = parseTemplateLiteral();
                expr = new WrappingNode(startToken).finishTaggedTemplateExpression(expr, quasi);
            } else {
                break;
            }
        }
        return expr;
    }

    // ECMA-262 12.4 Postfix Expressions

    function parsePostfixExpression() {
        var expr, token, startToken = lookahead;

        expr = inheritCoverGrammar(parseLeftHandSideExpressionAllowCall);

        if (!hasLineTerminator && lookahead.type === Token.Punctuator) {
            if (match('++') || match('--')) {
                // ECMA-262 11.3.1, 11.3.2
                if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
                    tolerateError(Messages.StrictLHSPostfix);
                }

                if (!isAssignmentTarget) {
                    tolerateError(Messages.InvalidLHSInAssignment);
                }

                isAssignmentTarget = isBindingElement = false;

                token = lex();
                expr = new WrappingNode(startToken).finishPostfixExpression(token.value, expr);
            }
        }

        return expr;
    }

    // ECMA-262 12.5 Unary Operators

    function parseUnaryExpression() {
        var token, expr, startToken;

        if (lookahead.type !== Token.Punctuator && lookahead.type !== Token.Keyword) {
            expr = parsePostfixExpression();
        } else if (match('++') || match('--')) {
            startToken = lookahead;
            token = lex();
            expr = inheritCoverGrammar(parseUnaryExpression);
            // ECMA-262 11.4.4, 11.4.5
            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
                tolerateError(Messages.StrictLHSPrefix);
            }

            if (!isAssignmentTarget) {
                tolerateError(Messages.InvalidLHSInAssignment);
            }
            expr = new WrappingNode(startToken).finishUnaryExpression(token.value, expr);
            isAssignmentTarget = isBindingElement = false;
        } else if (match('+') || match('-') || match('~') || match('!')) {
            startToken = lookahead;
            token = lex();
            expr = inheritCoverGrammar(parseUnaryExpression);
            expr = new WrappingNode(startToken).finishUnaryExpression(token.value, expr);
            isAssignmentTarget = isBindingElement = false;
        } else if (matchKeyword('delete') || matchKeyword('void') || matchKeyword('typeof')) {
            startToken = lookahead;
            token = lex();
            expr = inheritCoverGrammar(parseUnaryExpression);
            expr = new WrappingNode(startToken).finishUnaryExpression(token.value, expr);
            if (strict && expr.operator === 'delete' && expr.argument.type === Syntax.Identifier) {
                tolerateError(Messages.StrictDelete);
            }
            isAssignmentTarget = isBindingElement = false;
        } else {
            expr = parsePostfixExpression();
        }

        return expr;
    }

    function binaryPrecedence(token, allowIn) {
        var prec = 0;

        if (token.type !== Token.Punctuator && token.type !== Token.Keyword) {
            return 0;
        }

        switch (token.value) {
        case '||':
            prec = 1;
            break;

        case '&&':
            prec = 2;
            break;

        case '|':
            prec = 3;
            break;

        case '^':
            prec = 4;
            break;

        case '&':
            prec = 5;
            break;

        case '==':
        case '!=':
        case '===':
        case '!==':
            prec = 6;
            break;

        case '<':
        case '>':
        case '<=':
        case '>=':
        case 'instanceof':
            prec = 7;
            break;

        case 'in':
            prec = allowIn ? 7 : 0;
            break;

        case '<<':
        case '>>':
        case '>>>':
            prec = 8;
            break;

        case '+':
        case '-':
            prec = 9;
            break;

        case '*':
        case '/':
        case '%':
            prec = 11;
            break;

        default:
            break;
        }

        return prec;
    }

    // ECMA-262 12.6 Multiplicative Operators
    // ECMA-262 12.7 Additive Operators
    // ECMA-262 12.8 Bitwise Shift Operators
    // ECMA-262 12.9 Relational Operators
    // ECMA-262 12.10 Equality Operators
    // ECMA-262 12.11 Binary Bitwise Operators
    // ECMA-262 12.12 Binary Logical Operators

    function parseBinaryExpression() {
        var marker, markers, expr, token, prec, stack, right, operator, left, i;

        marker = lookahead;
        left = inheritCoverGrammar(parseUnaryExpression);

        token = lookahead;
        prec = binaryPrecedence(token, state.allowIn);
        if (prec === 0) {
            return left;
        }
        isAssignmentTarget = isBindingElement = false;
        token.prec = prec;
        lex();

        markers = [marker, lookahead];
        right = isolateCoverGrammar(parseUnaryExpression);

        stack = [left, token, right];

        while ((prec = binaryPrecedence(lookahead, state.allowIn)) > 0) {

            // Reduce: make a binary expression from the three topmost entries.
            while ((stack.length > 2) && (prec <= stack[stack.length - 2].prec)) {
                right = stack.pop();
                operator = stack.pop().value;
                left = stack.pop();
                markers.pop();
                expr = new WrappingNode(markers[markers.length - 1]).finishBinaryExpression(operator, left, right);
                stack.push(expr);
            }

            // Shift.
            token = lex();
            token.prec = prec;
            stack.push(token);
            markers.push(lookahead);
            expr = isolateCoverGrammar(parseUnaryExpression);
            stack.push(expr);
        }

        // Final reduce to clean-up the stack.
        i = stack.length - 1;
        expr = stack[i];
        markers.pop();
        while (i > 1) {
            expr = new WrappingNode(markers.pop()).finishBinaryExpression(stack[i - 1].value, stack[i - 2], expr);
            i -= 2;
        }

        return expr;
    }


    // ECMA-262 12.13 Conditional Operator

    function parseConditionalExpression() {
        var expr, previousAllowIn, consequent, alternate, startToken;

        startToken = lookahead;

        expr = inheritCoverGrammar(parseBinaryExpression);
        if (match('?')) {
            lex();
            previousAllowIn = state.allowIn;
            state.allowIn = true;
            consequent = isolateCoverGrammar(parseAssignmentExpression);
            state.allowIn = previousAllowIn;
            expect(':');
            alternate = isolateCoverGrammar(parseAssignmentExpression);

            expr = new WrappingNode(startToken).finishConditionalExpression(expr, consequent, alternate);
            isAssignmentTarget = isBindingElement = false;
        }

        return expr;
    }

    // ECMA-262 14.2 Arrow Function Definitions

    function parseConciseBody() {
        if (match('{')) {
            return parseFunctionSourceElements();
        }
        return isolateCoverGrammar(parseAssignmentExpression);
    }

    function checkPatternParam(options, param) {
        var i;
        switch (param.type) {
        case Syntax.Identifier:
            validateParam(options, param, param.name);
            break;
        case Syntax.RestElement:
            checkPatternParam(options, param.argument);
            break;
        case Syntax.AssignmentPattern:
            checkPatternParam(options, param.left);
            break;
        case Syntax.ArrayPattern:
            for (i = 0; i < param.elements.length; i++) {
                if (param.elements[i] !== null) {
                    checkPatternParam(options, param.elements[i]);
                }
            }
            break;
        case Syntax.YieldExpression:
            break;
        default:
            assert(param.type === Syntax.ObjectPattern, 'Invalid type');
            for (i = 0; i < param.properties.length; i++) {
                checkPatternParam(options, param.properties[i].value);
            }
            break;
        }
    }
    function reinterpretAsCoverFormalsList(expr) {
        var i, len, param, params, defaults, defaultCount, options, token;

        defaults = [];
        defaultCount = 0;
        params = [expr];

        switch (expr.type) {
        case Syntax.Identifier:
            break;
        case PlaceHolders.ArrowParameterPlaceHolder:
            params = expr.params;
            break;
        default:
            return null;
        }

        options = {
            paramSet: {}
        };

        for (i = 0, len = params.length; i < len; i += 1) {
            param = params[i];
            switch (param.type) {
            case Syntax.AssignmentPattern:
                params[i] = param.left;
                if (param.right.type === Syntax.YieldExpression) {
                    if (param.right.argument) {
                        throwUnexpectedToken(lookahead);
                    }
                    param.right.type = Syntax.Identifier;
                    param.right.name = 'yield';
                    delete param.right.argument;
                    delete param.right.delegate;
                }
                defaults.push(param.right);
                ++defaultCount;
                checkPatternParam(options, param.left);
                break;
            default:
                checkPatternParam(options, param);
                params[i] = param;
                defaults.push(null);
                break;
            }
        }

        if (strict || !state.allowYield) {
            for (i = 0, len = params.length; i < len; i += 1) {
                param = params[i];
                if (param.type === Syntax.YieldExpression) {
                    throwUnexpectedToken(lookahead);
                }
            }
        }

        if (options.message === Messages.StrictParamDupe) {
            token = strict ? options.stricted : options.firstRestricted;
            throwUnexpectedToken(token, options.message);
        }

        if (defaultCount === 0) {
            defaults = [];
        }

        return {
            params: params,
            defaults: defaults,
            stricted: options.stricted,
            firstRestricted: options.firstRestricted,
            message: options.message
        };
    }

    function parseArrowFunctionExpression(options, node) {
        var previousStrict, previousAllowYield, body;

        if (hasLineTerminator) {
            tolerateUnexpectedToken(lookahead);
        }
        expect('=>');

        previousStrict = strict;
        previousAllowYield = state.allowYield;
        state.allowYield = true;

        body = parseConciseBody();

        if (strict && options.firstRestricted) {
            throwUnexpectedToken(options.firstRestricted, options.message);
        }
        if (strict && options.stricted) {
            tolerateUnexpectedToken(options.stricted, options.message);
        }

        strict = previousStrict;
        state.allowYield = previousAllowYield;

        return node.finishArrowFunctionExpression(options.params, options.defaults, body, body.type !== Syntax.BlockStatement);
    }

    // ECMA-262 14.4 Yield expression

    function parseYieldExpression() {
        var argument, expr, delegate, previousAllowYield;

        argument = null;
        expr = new Node();
        delegate = false;

        expectKeyword('yield');

        if (!hasLineTerminator) {
            previousAllowYield = state.allowYield;
            state.allowYield = false;
            delegate = match('*');
            if (delegate) {
                lex();
                argument = parseAssignmentExpression();
            } else {
                if (!match(';') && !match('}') && !match(')') && lookahead.type !== Token.EOF) {
                    argument = parseAssignmentExpression();
                }
            }
            state.allowYield = previousAllowYield;
        }

        return expr.finishYieldExpression(argument, delegate);
    }

    // ECMA-262 12.14 Assignment Operators

    function parseAssignmentExpression() {
        var token, expr, right, list, startToken;

        startToken = lookahead;
        token = lookahead;

        if (!state.allowYield && matchKeyword('yield')) {
            return parseYieldExpression();
        }

        expr = parseConditionalExpression();

        if (expr.type === PlaceHolders.ArrowParameterPlaceHolder || match('=>')) {
            isAssignmentTarget = isBindingElement = false;
            list = reinterpretAsCoverFormalsList(expr);

            if (list) {
                firstCoverInitializedNameError = null;
                return parseArrowFunctionExpression(list, new WrappingNode(startToken));
            }

            return expr;
        }

        if (matchAssign()) {
            if (!isAssignmentTarget) {
                tolerateError(Messages.InvalidLHSInAssignment);
            }

            // ECMA-262 12.1.1
            if (strict && expr.type === Syntax.Identifier) {
                if (isRestrictedWord(expr.name)) {
                    tolerateUnexpectedToken(token, Messages.StrictLHSAssignment);
                }
                if (isStrictModeReservedWord(expr.name)) {
                    tolerateUnexpectedToken(token, Messages.StrictReservedWord);
                }
            }

            if (!match('=')) {
                isAssignmentTarget = isBindingElement = false;
            } else {
                reinterpretExpressionAsPattern(expr);
            }

            token = lex();
            right = isolateCoverGrammar(parseAssignmentExpression);
            expr = new WrappingNode(startToken).finishAssignmentExpression(token.value, expr, right);
            firstCoverInitializedNameError = null;
        }

        return expr;
    }

    // ECMA-262 12.15 Comma Operator

    function parseExpression() {
        var expr, startToken = lookahead, expressions;

        expr = isolateCoverGrammar(parseAssignmentExpression);

        if (match(',')) {
            expressions = [expr];

            while (startIndex < length) {
                if (!match(',')) {
                    break;
                }
                lex();
                expressions.push(isolateCoverGrammar(parseAssignmentExpression));
            }

            expr = new WrappingNode(startToken).finishSequenceExpression(expressions);
        }

        return expr;
    }

    // ECMA-262 13.2 Block

    function parseStatementListItem() {
        if (lookahead.type === Token.Keyword) {
            switch (lookahead.value) {
            case 'export':
                if (state.sourceType !== 'module') {
                    tolerateUnexpectedToken(lookahead, Messages.IllegalExportDeclaration);
                }
                return parseExportDeclaration();
            case 'import':
                if (state.sourceType !== 'module') {
                    tolerateUnexpectedToken(lookahead, Messages.IllegalImportDeclaration);
                }
                return parseImportDeclaration();
            case 'const':
                return parseLexicalDeclaration({inFor: false});
            case 'function':
                return parseFunctionDeclaration(new Node());
            case 'class':
                return parseClassDeclaration();
            }
        }

        if (matchKeyword('let') && isLexicalDeclaration()) {
            return parseLexicalDeclaration({inFor: false});
        }

        return parseStatement();
    }

    function parseStatementList() {
        var list = [];
        while (startIndex < length) {
            if (match('}')) {
                break;
            }
            list.push(parseStatementListItem());
        }

        return list;
    }

    function parseBlock() {
        var block, node = new Node();

        expect('{');

        block = parseStatementList();

        expect('}');

        return node.finishBlockStatement(block);
    }

    // ECMA-262 13.3.2 Variable Statement

    function parseVariableIdentifier(kind) {
        var token, node = new Node();

        token = lex();

        if (token.type === Token.Keyword && token.value === 'yield') {
            if (strict) {
                tolerateUnexpectedToken(token, Messages.StrictReservedWord);
            } if (!state.allowYield) {
                throwUnexpectedToken(token);
            }
        } else if (token.type !== Token.Identifier) {
            if (strict && token.type === Token.Keyword && isStrictModeReservedWord(token.value)) {
                tolerateUnexpectedToken(token, Messages.StrictReservedWord);
            } else {
                if (strict || token.value !== 'let' || kind !== 'var') {
                    throwUnexpectedToken(token);
                }
            }
        } else if (state.sourceType === 'module' && token.type === Token.Identifier && token.value === 'await') {
            tolerateUnexpectedToken(token);
        }

        return node.finishIdentifier(token.value);
    }

    function parseVariableDeclaration(options) {
        var init = null, id, node = new Node(), params = [];

        id = parsePattern(params, 'var');

        // ECMA-262 12.2.1
        if (strict && isRestrictedWord(id.name)) {
            tolerateError(Messages.StrictVarName);
        }

        if (match('=')) {
            lex();
            init = isolateCoverGrammar(parseAssignmentExpression);
        } else if (id.type !== Syntax.Identifier && !options.inFor) {
            expect('=');
        }

        return node.finishVariableDeclarator(id, init);
    }

    function parseVariableDeclarationList(options) {
        var opt, list;

        opt = { inFor: options.inFor };
        list = [parseVariableDeclaration(opt)];

        while (match(',')) {
            lex();
            list.push(parseVariableDeclaration(opt));
        }

        return list;
    }

    function parseVariableStatement(node) {
        var declarations;

        expectKeyword('var');

        declarations = parseVariableDeclarationList({ inFor: false });

        consumeSemicolon();

        return node.finishVariableDeclaration(declarations);
    }

    // ECMA-262 13.3.1 Let and Const Declarations

    function parseLexicalBinding(kind, options) {
        var init = null, id, node = new Node(), params = [];

        id = parsePattern(params, kind);

        // ECMA-262 12.2.1
        if (strict && id.type === Syntax.Identifier && isRestrictedWord(id.name)) {
            tolerateError(Messages.StrictVarName);
        }

        if (kind === 'const') {
            if (!matchKeyword('in') && !matchContextualKeyword('of')) {
                expect('=');
                init = isolateCoverGrammar(parseAssignmentExpression);
            }
        } else if ((!options.inFor && id.type !== Syntax.Identifier) || match('=')) {
            expect('=');
            init = isolateCoverGrammar(parseAssignmentExpression);
        }

        return node.finishVariableDeclarator(id, init);
    }

    function parseBindingList(kind, options) {
        var list = [parseLexicalBinding(kind, options)];

        while (match(',')) {
            lex();
            list.push(parseLexicalBinding(kind, options));
        }

        return list;
    }


    function tokenizerState() {
        return {
            index: index,
            lineNumber: lineNumber,
            lineStart: lineStart,
            hasLineTerminator: hasLineTerminator,
            lastIndex: lastIndex,
            lastLineNumber: lastLineNumber,
            lastLineStart: lastLineStart,
            startIndex: startIndex,
            startLineNumber: startLineNumber,
            startLineStart: startLineStart,
            lookahead: lookahead,
            tokenCount: extra.tokens ? extra.tokens.length : 0
        };
    }

    function resetTokenizerState(ts) {
        index = ts.index;
        lineNumber = ts.lineNumber;
        lineStart = ts.lineStart;
        hasLineTerminator = ts.hasLineTerminator;
        lastIndex = ts.lastIndex;
        lastLineNumber = ts.lastLineNumber;
        lastLineStart = ts.lastLineStart;
        startIndex = ts.startIndex;
        startLineNumber = ts.startLineNumber;
        startLineStart = ts.startLineStart;
        lookahead = ts.lookahead;
        if (extra.tokens) {
            extra.tokens.splice(ts.tokenCount, extra.tokens.length);
        }
    }

    function isLexicalDeclaration() {
        var lexical, ts;

        ts = tokenizerState();

        lex();
        lexical = (lookahead.type === Token.Identifier) || match('[') || match('{') ||
            matchKeyword('let') || matchKeyword('yield');

        resetTokenizerState(ts);

        return lexical;
    }

    function parseLexicalDeclaration(options) {
        var kind, declarations, node = new Node();

        kind = lex().value;
        assert(kind === 'let' || kind === 'const', 'Lexical declaration must be either let or const');

        declarations = parseBindingList(kind, options);

        consumeSemicolon();

        return node.finishLexicalDeclaration(declarations, kind);
    }

    function parseRestElement(params) {
        var param, node = new Node();

        lex();

        if (match('{')) {
            throwError(Messages.ObjectPatternAsRestParameter);
        }

        params.push(lookahead);

        param = parseVariableIdentifier();

        if (match('=')) {
            throwError(Messages.DefaultRestParameter);
        }

        if (!match(')')) {
            throwError(Messages.ParameterAfterRestParameter);
        }

        return node.finishRestElement(param);
    }

    // ECMA-262 13.4 Empty Statement

    function parseEmptyStatement(node) {
        expect(';');
        return node.finishEmptyStatement();
    }

    // ECMA-262 12.4 Expression Statement

    function parseExpressionStatement(node) {
        var expr = parseExpression();
        consumeSemicolon();
        return node.finishExpressionStatement(expr);
    }

    // ECMA-262 13.6 If statement

    function parseIfStatement(node) {
        var test, consequent, alternate;

        expectKeyword('if');

        expect('(');

        test = parseExpression();

        expect(')');

        consequent = parseStatement();

        if (matchKeyword('else')) {
            lex();
            alternate = parseStatement();
        } else {
            alternate = null;
        }

        return node.finishIfStatement(test, consequent, alternate);
    }

    // ECMA-262 13.7 Iteration Statements

    function parseDoWhileStatement(node) {
        var body, test, oldInIteration;

        expectKeyword('do');

        oldInIteration = state.inIteration;
        state.inIteration = true;

        body = parseStatement();

        state.inIteration = oldInIteration;

        expectKeyword('while');

        expect('(');

        test = parseExpression();

        expect(')');

        if (match(';')) {
            lex();
        }

        return node.finishDoWhileStatement(body, test);
    }

    function parseWhileStatement(node) {
        var test, body, oldInIteration;

        expectKeyword('while');

        expect('(');

        test = parseExpression();

        expect(')');

        oldInIteration = state.inIteration;
        state.inIteration = true;

        body = parseStatement();

        state.inIteration = oldInIteration;

        return node.finishWhileStatement(test, body);
    }

    function parseForStatement(node) {
        var init, forIn, initSeq, initStartToken, test, update, left, right, kind, declarations,
            body, oldInIteration, previousAllowIn = state.allowIn;

        init = test = update = null;
        forIn = true;

        expectKeyword('for');

        expect('(');

        if (match(';')) {
            lex();
        } else {
            if (matchKeyword('var')) {
                init = new Node();
                lex();

                state.allowIn = false;
                declarations = parseVariableDeclarationList({ inFor: true });
                state.allowIn = previousAllowIn;

                if (declarations.length === 1 && matchKeyword('in')) {
                    init = init.finishVariableDeclaration(declarations);
                    lex();
                    left = init;
                    right = parseExpression();
                    init = null;
                } else if (declarations.length === 1 && declarations[0].init === null && matchContextualKeyword('of')) {
                    init = init.finishVariableDeclaration(declarations);
                    lex();
                    left = init;
                    right = parseAssignmentExpression();
                    init = null;
                    forIn = false;
                } else {
                    init = init.finishVariableDeclaration(declarations);
                    expect(';');
                }
            } else if (matchKeyword('const') || matchKeyword('let')) {
                init = new Node();
                kind = lex().value;

                if (!strict && lookahead.value === 'in') {
                    init = init.finishIdentifier(kind);
                    lex();
                    left = init;
                    right = parseExpression();
                    init = null;
                } else {
                    state.allowIn = false;
                    declarations = parseBindingList(kind, {inFor: true});
                    state.allowIn = previousAllowIn;

                    if (declarations.length === 1 && declarations[0].init === null && matchKeyword('in')) {
                        init = init.finishLexicalDeclaration(declarations, kind);
                        lex();
                        left = init;
                        right = parseExpression();
                        init = null;
                    } else if (declarations.length === 1 && declarations[0].init === null && matchContextualKeyword('of')) {
                        init = init.finishLexicalDeclaration(declarations, kind);
                        lex();
                        left = init;
                        right = parseAssignmentExpression();
                        init = null;
                        forIn = false;
                    } else {
                        consumeSemicolon();
                        init = init.finishLexicalDeclaration(declarations, kind);
                    }
                }
            } else {
                initStartToken = lookahead;
                state.allowIn = false;
                init = inheritCoverGrammar(parseAssignmentExpression);
                state.allowIn = previousAllowIn;

                if (matchKeyword('in')) {
                    if (!isAssignmentTarget) {
                        tolerateError(Messages.InvalidLHSInForIn);
                    }

                    lex();
                    reinterpretExpressionAsPattern(init);
                    left = init;
                    right = parseExpression();
                    init = null;
                } else if (matchContextualKeyword('of')) {
                    if (!isAssignmentTarget) {
                        tolerateError(Messages.InvalidLHSInForLoop);
                    }

                    lex();
                    reinterpretExpressionAsPattern(init);
                    left = init;
                    right = parseAssignmentExpression();
                    init = null;
                    forIn = false;
                } else {
                    if (match(',')) {
                        initSeq = [init];
                        while (match(',')) {
                            lex();
                            initSeq.push(isolateCoverGrammar(parseAssignmentExpression));
                        }
                        init = new WrappingNode(initStartToken).finishSequenceExpression(initSeq);
                    }
                    expect(';');
                }
            }
        }

        if (typeof left === 'undefined') {

            if (!match(';')) {
                test = parseExpression();
            }
            expect(';');

            if (!match(')')) {
                update = parseExpression();
            }
        }

        expect(')');

        oldInIteration = state.inIteration;
        state.inIteration = true;

        body = isolateCoverGrammar(parseStatement);

        state.inIteration = oldInIteration;

        return (typeof left === 'undefined') ?
                node.finishForStatement(init, test, update, body) :
                forIn ? node.finishForInStatement(left, right, body) :
                    node.finishForOfStatement(left, right, body);
    }

    // ECMA-262 13.8 The continue statement

    function parseContinueStatement(node) {
        var label = null, key;

        expectKeyword('continue');

        // Optimize the most common form: 'continue;'.
        if (source.charCodeAt(startIndex) === 0x3B) {
            lex();

            if (!state.inIteration) {
                throwError(Messages.IllegalContinue);
            }

            return node.finishContinueStatement(null);
        }

        if (hasLineTerminator) {
            if (!state.inIteration) {
                throwError(Messages.IllegalContinue);
            }

            return node.finishContinueStatement(null);
        }

        if (lookahead.type === Token.Identifier) {
            label = parseVariableIdentifier();

            key = '$' + label.name;
            if (!Object.prototype.hasOwnProperty.call(state.labelSet, key)) {
                throwError(Messages.UnknownLabel, label.name);
            }
        }

        consumeSemicolon();

        if (label === null && !state.inIteration) {
            throwError(Messages.IllegalContinue);
        }

        return node.finishContinueStatement(label);
    }

    // ECMA-262 13.9 The break statement

    function parseBreakStatement(node) {
        var label = null, key;

        expectKeyword('break');

        // Catch the very common case first: immediately a semicolon (U+003B).
        if (source.charCodeAt(lastIndex) === 0x3B) {
            lex();

            if (!(state.inIteration || state.inSwitch)) {
                throwError(Messages.IllegalBreak);
            }

            return node.finishBreakStatement(null);
        }

        if (hasLineTerminator) {
            if (!(state.inIteration || state.inSwitch)) {
                throwError(Messages.IllegalBreak);
            }
        } else if (lookahead.type === Token.Identifier) {
            label = parseVariableIdentifier();

            key = '$' + label.name;
            if (!Object.prototype.hasOwnProperty.call(state.labelSet, key)) {
                throwError(Messages.UnknownLabel, label.name);
            }
        }

        consumeSemicolon();

        if (label === null && !(state.inIteration || state.inSwitch)) {
            throwError(Messages.IllegalBreak);
        }

        return node.finishBreakStatement(label);
    }

    // ECMA-262 13.10 The return statement

    function parseReturnStatement(node) {
        var argument = null;

        expectKeyword('return');

        if (!state.inFunctionBody) {
            tolerateError(Messages.IllegalReturn);
        }

        // 'return' followed by a space and an identifier is very common.
        if (source.charCodeAt(lastIndex) === 0x20) {
            if (isIdentifierStart(source.charCodeAt(lastIndex + 1))) {
                argument = parseExpression();
                consumeSemicolon();
                return node.finishReturnStatement(argument);
            }
        }

        if (hasLineTerminator) {
            // HACK
            return node.finishReturnStatement(null);
        }

        if (!match(';')) {
            if (!match('}') && lookahead.type !== Token.EOF) {
                argument = parseExpression();
            }
        }

        consumeSemicolon();

        return node.finishReturnStatement(argument);
    }

    // ECMA-262 13.11 The with statement

    function parseWithStatement(node) {
        var object, body;

        if (strict) {
            tolerateError(Messages.StrictModeWith);
        }

        expectKeyword('with');

        expect('(');

        object = parseExpression();

        expect(')');

        body = parseStatement();

        return node.finishWithStatement(object, body);
    }

    // ECMA-262 13.12 The switch statement

    function parseSwitchCase() {
        var test, consequent = [], statement, node = new Node();

        if (matchKeyword('default')) {
            lex();
            test = null;
        } else {
            expectKeyword('case');
            test = parseExpression();
        }
        expect(':');

        while (startIndex < length) {
            if (match('}') || matchKeyword('default') || matchKeyword('case')) {
                break;
            }
            statement = parseStatementListItem();
            consequent.push(statement);
        }

        return node.finishSwitchCase(test, consequent);
    }

    function parseSwitchStatement(node) {
        var discriminant, cases, clause, oldInSwitch, defaultFound;

        expectKeyword('switch');

        expect('(');

        discriminant = parseExpression();

        expect(')');

        expect('{');

        cases = [];

        if (match('}')) {
            lex();
            return node.finishSwitchStatement(discriminant, cases);
        }

        oldInSwitch = state.inSwitch;
        state.inSwitch = true;
        defaultFound = false;

        while (startIndex < length) {
            if (match('}')) {
                break;
            }
            clause = parseSwitchCase();
            if (clause.test === null) {
                if (defaultFound) {
                    throwError(Messages.MultipleDefaultsInSwitch);
                }
                defaultFound = true;
            }
            cases.push(clause);
        }

        state.inSwitch = oldInSwitch;

        expect('}');

        return node.finishSwitchStatement(discriminant, cases);
    }

    // ECMA-262 13.14 The throw statement

    function parseThrowStatement(node) {
        var argument;

        expectKeyword('throw');

        if (hasLineTerminator) {
            throwError(Messages.NewlineAfterThrow);
        }

        argument = parseExpression();

        consumeSemicolon();

        return node.finishThrowStatement(argument);
    }

    // ECMA-262 13.15 The try statement

    function parseCatchClause() {
        var param, params = [], paramMap = {}, key, i, body, node = new Node();

        expectKeyword('catch');

        expect('(');
        if (match(')')) {
            throwUnexpectedToken(lookahead);
        }

        param = parsePattern(params);
        for (i = 0; i < params.length; i++) {
            key = '$' + params[i].value;
            if (Object.prototype.hasOwnProperty.call(paramMap, key)) {
                tolerateError(Messages.DuplicateBinding, params[i].value);
            }
            paramMap[key] = true;
        }

        // ECMA-262 12.14.1
        if (strict && isRestrictedWord(param.name)) {
            tolerateError(Messages.StrictCatchVariable);
        }

        expect(')');
        body = parseBlock();
        return node.finishCatchClause(param, body);
    }

    function parseTryStatement(node) {
        var block, handler = null, finalizer = null;

        expectKeyword('try');

        block = parseBlock();

        if (matchKeyword('catch')) {
            handler = parseCatchClause();
        }

        if (matchKeyword('finally')) {
            lex();
            finalizer = parseBlock();
        }

        if (!handler && !finalizer) {
            throwError(Messages.NoCatchOrFinally);
        }

        return node.finishTryStatement(block, handler, finalizer);
    }

    // ECMA-262 13.16 The debugger statement

    function parseDebuggerStatement(node) {
        expectKeyword('debugger');

        consumeSemicolon();

        return node.finishDebuggerStatement();
    }

    // 13 Statements

    function parseStatement() {
        var type = lookahead.type,
            expr,
            labeledBody,
            key,
            node;

        if (type === Token.EOF) {
            throwUnexpectedToken(lookahead);
        }

        if (type === Token.Punctuator && lookahead.value === '{') {
            return parseBlock();
        }
        isAssignmentTarget = isBindingElement = true;
        node = new Node();

        if (type === Token.Punctuator) {
            switch (lookahead.value) {
            case ';':
                return parseEmptyStatement(node);
            case '(':
                return parseExpressionStatement(node);
            default:
                break;
            }
        } else if (type === Token.Keyword) {
            switch (lookahead.value) {
            case 'break':
                return parseBreakStatement(node);
            case 'continue':
                return parseContinueStatement(node);
            case 'debugger':
                return parseDebuggerStatement(node);
            case 'do':
                return parseDoWhileStatement(node);
            case 'for':
                return parseForStatement(node);
            case 'function':
                return parseFunctionDeclaration(node);
            case 'if':
                return parseIfStatement(node);
            case 'return':
                return parseReturnStatement(node);
            case 'switch':
                return parseSwitchStatement(node);
            case 'throw':
                return parseThrowStatement(node);
            case 'try':
                return parseTryStatement(node);
            case 'var':
                return parseVariableStatement(node);
            case 'while':
                return parseWhileStatement(node);
            case 'with':
                return parseWithStatement(node);
            default:
                break;
            }
        }

        expr = parseExpression();

        // ECMA-262 12.12 Labelled Statements
        if ((expr.type === Syntax.Identifier) && match(':')) {
            lex();

            key = '$' + expr.name;
            if (Object.prototype.hasOwnProperty.call(state.labelSet, key)) {
                throwError(Messages.Redeclaration, 'Label', expr.name);
            }

            state.labelSet[key] = true;
            labeledBody = parseStatement();
            delete state.labelSet[key];
            return node.finishLabeledStatement(expr, labeledBody);
        }

        consumeSemicolon();

        return node.finishExpressionStatement(expr);
    }

    // ECMA-262 14.1 Function Definition

    function parseFunctionSourceElements() {
        var statement, body = [], token, directive, firstRestricted,
            oldLabelSet, oldInIteration, oldInSwitch, oldInFunctionBody,
            node = new Node();

        expect('{');

        while (startIndex < length) {
            if (lookahead.type !== Token.StringLiteral) {
                break;
            }
            token = lookahead;

            statement = parseStatementListItem();
            body.push(statement);
            if (statement.expression.type !== Syntax.Literal) {
                // this is not directive
                break;
            }
            directive = source.slice(token.start + 1, token.end - 1);
            if (directive === 'use strict') {
                strict = true;
                if (firstRestricted) {
                    tolerateUnexpectedToken(firstRestricted, Messages.StrictOctalLiteral);
                }
            } else {
                if (!firstRestricted && token.octal) {
                    firstRestricted = token;
                }
            }
        }

        oldLabelSet = state.labelSet;
        oldInIteration = state.inIteration;
        oldInSwitch = state.inSwitch;
        oldInFunctionBody = state.inFunctionBody;

        state.labelSet = {};
        state.inIteration = false;
        state.inSwitch = false;
        state.inFunctionBody = true;

        while (startIndex < length) {
            if (match('}')) {
                break;
            }
            body.push(parseStatementListItem());
        }

        expect('}');

        state.labelSet = oldLabelSet;
        state.inIteration = oldInIteration;
        state.inSwitch = oldInSwitch;
        state.inFunctionBody = oldInFunctionBody;

        return node.finishBlockStatement(body);
    }

    function validateParam(options, param, name) {
        var key = '$' + name;
        if (strict) {
            if (isRestrictedWord(name)) {
                options.stricted = param;
                options.message = Messages.StrictParamName;
            }
            if (Object.prototype.hasOwnProperty.call(options.paramSet, key)) {
                options.stricted = param;
                options.message = Messages.StrictParamDupe;
            }
        } else if (!options.firstRestricted) {
            if (isRestrictedWord(name)) {
                options.firstRestricted = param;
                options.message = Messages.StrictParamName;
            } else if (isStrictModeReservedWord(name)) {
                options.firstRestricted = param;
                options.message = Messages.StrictReservedWord;
            } else if (Object.prototype.hasOwnProperty.call(options.paramSet, key)) {
                options.stricted = param;
                options.message = Messages.StrictParamDupe;
            }
        }
        options.paramSet[key] = true;
    }

    function parseParam(options) {
        var token, param, params = [], i, def;

        token = lookahead;
        if (token.value === '...') {
            param = parseRestElement(params);
            validateParam(options, param.argument, param.argument.name);
            options.params.push(param);
            options.defaults.push(null);
            return false;
        }

        param = parsePatternWithDefault(params);
        for (i = 0; i < params.length; i++) {
            validateParam(options, params[i], params[i].value);
        }

        if (param.type === Syntax.AssignmentPattern) {
            def = param.right;
            param = param.left;
            ++options.defaultCount;
        }

        options.params.push(param);
        options.defaults.push(def);

        return !match(')');
    }

    function parseParams(firstRestricted) {
        var options;

        options = {
            params: [],
            defaultCount: 0,
            defaults: [],
            firstRestricted: firstRestricted
        };

        expect('(');

        if (!match(')')) {
            options.paramSet = {};
            while (startIndex < length) {
                if (!parseParam(options)) {
                    break;
                }
                expect(',');
            }
        }

        expect(')');

        if (options.defaultCount === 0) {
            options.defaults = [];
        }

        return {
            params: options.params,
            defaults: options.defaults,
            stricted: options.stricted,
            firstRestricted: options.firstRestricted,
            message: options.message
        };
    }

    function parseFunctionDeclaration(node, identifierIsOptional) {
        var id = null, params = [], defaults = [], body, token, stricted, tmp, firstRestricted, message, previousStrict,
            isGenerator, previousAllowYield;

        previousAllowYield = state.allowYield;

        expectKeyword('function');

        isGenerator = match('*');
        if (isGenerator) {
            lex();
        }

        if (!identifierIsOptional || !match('(')) {
            token = lookahead;
            id = parseVariableIdentifier();
            if (strict) {
                if (isRestrictedWord(token.value)) {
                    tolerateUnexpectedToken(token, Messages.StrictFunctionName);
                }
            } else {
                if (isRestrictedWord(token.value)) {
                    firstRestricted = token;
                    message = Messages.StrictFunctionName;
                } else if (isStrictModeReservedWord(token.value)) {
                    firstRestricted = token;
                    message = Messages.StrictReservedWord;
                }
            }
        }

        state.allowYield = !isGenerator;
        tmp = parseParams(firstRestricted);
        params = tmp.params;
        defaults = tmp.defaults;
        stricted = tmp.stricted;
        firstRestricted = tmp.firstRestricted;
        if (tmp.message) {
            message = tmp.message;
        }


        previousStrict = strict;
        body = parseFunctionSourceElements();
        if (strict && firstRestricted) {
            throwUnexpectedToken(firstRestricted, message);
        }
        if (strict && stricted) {
            tolerateUnexpectedToken(stricted, message);
        }

        strict = previousStrict;
        state.allowYield = previousAllowYield;

        return node.finishFunctionDeclaration(id, params, defaults, body, isGenerator);
    }

    function parseFunctionExpression() {
        var token, id = null, stricted, firstRestricted, message, tmp,
            params = [], defaults = [], body, previousStrict, node = new Node(),
            isGenerator, previousAllowYield;

        previousAllowYield = state.allowYield;

        expectKeyword('function');

        isGenerator = match('*');
        if (isGenerator) {
            lex();
        }

        state.allowYield = !isGenerator;
        if (!match('(')) {
            token = lookahead;
            id = (!strict && !isGenerator && matchKeyword('yield')) ? parseNonComputedProperty() : parseVariableIdentifier();
            if (strict) {
                if (isRestrictedWord(token.value)) {
                    tolerateUnexpectedToken(token, Messages.StrictFunctionName);
                }
            } else {
                if (isRestrictedWord(token.value)) {
                    firstRestricted = token;
                    message = Messages.StrictFunctionName;
                } else if (isStrictModeReservedWord(token.value)) {
                    firstRestricted = token;
                    message = Messages.StrictReservedWord;
                }
            }
        }

        tmp = parseParams(firstRestricted);
        params = tmp.params;
        defaults = tmp.defaults;
        stricted = tmp.stricted;
        firstRestricted = tmp.firstRestricted;
        if (tmp.message) {
            message = tmp.message;
        }

        previousStrict = strict;
        body = parseFunctionSourceElements();
        if (strict && firstRestricted) {
            throwUnexpectedToken(firstRestricted, message);
        }
        if (strict && stricted) {
            tolerateUnexpectedToken(stricted, message);
        }
        strict = previousStrict;
        state.allowYield = previousAllowYield;

        return node.finishFunctionExpression(id, params, defaults, body, isGenerator);
    }

    // ECMA-262 14.5 Class Definitions

    function parseClassBody() {
        var classBody, token, isStatic, hasConstructor = false, body, method, computed, key;

        classBody = new Node();

        expect('{');
        body = [];
        while (!match('}')) {
            if (match(';')) {
                lex();
            } else {
                method = new Node();
                token = lookahead;
                isStatic = false;
                computed = match('[');
                if (match('*')) {
                    lex();
                } else {
                    key = parseObjectPropertyKey();
                    if (key.name === 'static' && (lookaheadPropertyName() || match('*'))) {
                        token = lookahead;
                        isStatic = true;
                        computed = match('[');
                        if (match('*')) {
                            lex();
                        } else {
                            key = parseObjectPropertyKey();
                        }
                    }
                }
                method = tryParseMethodDefinition(token, key, computed, method);
                if (method) {
                    method['static'] = isStatic; // jscs:ignore requireDotNotation
                    if (method.kind === 'init') {
                        method.kind = 'method';
                    }
                    if (!isStatic) {
                        if (!method.computed && (method.key.name || method.key.value.toString()) === 'constructor') {
                            if (method.kind !== 'method' || !method.method || method.value.generator) {
                                throwUnexpectedToken(token, Messages.ConstructorSpecialMethod);
                            }
                            if (hasConstructor) {
                                throwUnexpectedToken(token, Messages.DuplicateConstructor);
                            } else {
                                hasConstructor = true;
                            }
                            method.kind = 'constructor';
                        }
                    } else {
                        if (!method.computed && (method.key.name || method.key.value.toString()) === 'prototype') {
                            throwUnexpectedToken(token, Messages.StaticPrototype);
                        }
                    }
                    method.type = Syntax.MethodDefinition;
                    delete method.method;
                    delete method.shorthand;
                    body.push(method);
                } else {
                    throwUnexpectedToken(lookahead);
                }
            }
        }
        lex();
        return classBody.finishClassBody(body);
    }

    function parseClassDeclaration(identifierIsOptional) {
        var id = null, superClass = null, classNode = new Node(), classBody, previousStrict = strict;
        strict = true;

        expectKeyword('class');

        if (!identifierIsOptional || lookahead.type === Token.Identifier) {
            id = parseVariableIdentifier();
        }

        if (matchKeyword('extends')) {
            lex();
            superClass = isolateCoverGrammar(parseLeftHandSideExpressionAllowCall);
        }
        classBody = parseClassBody();
        strict = previousStrict;

        return classNode.finishClassDeclaration(id, superClass, classBody);
    }

    function parseClassExpression() {
        var id = null, superClass = null, classNode = new Node(), classBody, previousStrict = strict;
        strict = true;

        expectKeyword('class');

        if (lookahead.type === Token.Identifier) {
            id = parseVariableIdentifier();
        }

        if (matchKeyword('extends')) {
            lex();
            superClass = isolateCoverGrammar(parseLeftHandSideExpressionAllowCall);
        }
        classBody = parseClassBody();
        strict = previousStrict;

        return classNode.finishClassExpression(id, superClass, classBody);
    }

    // ECMA-262 15.2 Modules

    function parseModuleSpecifier() {
        var node = new Node();

        if (lookahead.type !== Token.StringLiteral) {
            throwError(Messages.InvalidModuleSpecifier);
        }
        return node.finishLiteral(lex());
    }

    // ECMA-262 15.2.3 Exports

    function parseExportSpecifier() {
        var exported, local, node = new Node(), def;
        if (matchKeyword('default')) {
            // export {default} from 'something';
            def = new Node();
            lex();
            local = def.finishIdentifier('default');
        } else {
            local = parseVariableIdentifier();
        }
        if (matchContextualKeyword('as')) {
            lex();
            exported = parseNonComputedProperty();
        }
        return node.finishExportSpecifier(local, exported);
    }

    function parseExportNamedDeclaration(node) {
        var declaration = null,
            isExportFromIdentifier,
            src = null, specifiers = [];

        // non-default export
        if (lookahead.type === Token.Keyword) {
            // covers:
            // export var f = 1;
            switch (lookahead.value) {
                case 'let':
                case 'const':
                    declaration = parseLexicalDeclaration({inFor: false});
                    return node.finishExportNamedDeclaration(declaration, specifiers, null);
                case 'var':
                case 'class':
                case 'function':
                    declaration = parseStatementListItem();
                    return node.finishExportNamedDeclaration(declaration, specifiers, null);
            }
        }

        expect('{');
        while (!match('}')) {
            isExportFromIdentifier = isExportFromIdentifier || matchKeyword('default');
            specifiers.push(parseExportSpecifier());
            if (!match('}')) {
                expect(',');
                if (match('}')) {
                    break;
                }
            }
        }
        expect('}');

        if (matchContextualKeyword('from')) {
            // covering:
            // export {default} from 'foo';
            // export {foo} from 'foo';
            lex();
            src = parseModuleSpecifier();
            consumeSemicolon();
        } else if (isExportFromIdentifier) {
            // covering:
            // export {default}; // missing fromClause
            throwError(lookahead.value ?
                    Messages.UnexpectedToken : Messages.MissingFromClause, lookahead.value);
        } else {
            // cover
            // export {foo};
            consumeSemicolon();
        }
        return node.finishExportNamedDeclaration(declaration, specifiers, src);
    }

    function parseExportDefaultDeclaration(node) {
        var declaration = null,
            expression = null;

        // covers:
        // export default ...
        expectKeyword('default');

        if (matchKeyword('function')) {
            // covers:
            // export default function foo () {}
            // export default function () {}
            declaration = parseFunctionDeclaration(new Node(), true);
            return node.finishExportDefaultDeclaration(declaration);
        }
        if (matchKeyword('class')) {
            declaration = parseClassDeclaration(true);
            return node.finishExportDefaultDeclaration(declaration);
        }

        if (matchContextualKeyword('from')) {
            throwError(Messages.UnexpectedToken, lookahead.value);
        }

        // covers:
        // export default {};
        // export default [];
        // export default (1 + 2);
        if (match('{')) {
            expression = parseObjectInitializer();
        } else if (match('[')) {
            expression = parseArrayInitializer();
        } else {
            expression = parseAssignmentExpression();
        }
        consumeSemicolon();
        return node.finishExportDefaultDeclaration(expression);
    }

    function parseExportAllDeclaration(node) {
        var src;

        // covers:
        // export * from 'foo';
        expect('*');
        if (!matchContextualKeyword('from')) {
            throwError(lookahead.value ?
                    Messages.UnexpectedToken : Messages.MissingFromClause, lookahead.value);
        }
        lex();
        src = parseModuleSpecifier();
        consumeSemicolon();

        return node.finishExportAllDeclaration(src);
    }

    function parseExportDeclaration() {
        var node = new Node();
        if (state.inFunctionBody) {
            throwError(Messages.IllegalExportDeclaration);
        }

        expectKeyword('export');

        if (matchKeyword('default')) {
            return parseExportDefaultDeclaration(node);
        }
        if (match('*')) {
            return parseExportAllDeclaration(node);
        }
        return parseExportNamedDeclaration(node);
    }

    // ECMA-262 15.2.2 Imports

    function parseImportSpecifier() {
        // import {<foo as bar>} ...;
        var local, imported, node = new Node();

        imported = parseNonComputedProperty();
        if (matchContextualKeyword('as')) {
            lex();
            local = parseVariableIdentifier();
        }

        return node.finishImportSpecifier(local, imported);
    }

    function parseNamedImports() {
        var specifiers = [];
        // {foo, bar as bas}
        expect('{');
        while (!match('}')) {
            specifiers.push(parseImportSpecifier());
            if (!match('}')) {
                expect(',');
                if (match('}')) {
                    break;
                }
            }
        }
        expect('}');
        return specifiers;
    }

    function parseImportDefaultSpecifier() {
        // import <foo> ...;
        var local, node = new Node();

        local = parseNonComputedProperty();

        return node.finishImportDefaultSpecifier(local);
    }

    function parseImportNamespaceSpecifier() {
        // import <* as foo> ...;
        var local, node = new Node();

        expect('*');
        if (!matchContextualKeyword('as')) {
            throwError(Messages.NoAsAfterImportNamespace);
        }
        lex();
        local = parseNonComputedProperty();

        return node.finishImportNamespaceSpecifier(local);
    }

    function parseImportDeclaration() {
        var specifiers = [], src, node = new Node();

        if (state.inFunctionBody) {
            throwError(Messages.IllegalImportDeclaration);
        }

        expectKeyword('import');

        if (lookahead.type === Token.StringLiteral) {
            // import 'foo';
            src = parseModuleSpecifier();
        } else {

            if (match('{')) {
                // import {bar}
                specifiers = specifiers.concat(parseNamedImports());
            } else if (match('*')) {
                // import * as foo
                specifiers.push(parseImportNamespaceSpecifier());
            } else if (isIdentifierName(lookahead) && !matchKeyword('default')) {
                // import foo
                specifiers.push(parseImportDefaultSpecifier());
                if (match(',')) {
                    lex();
                    if (match('*')) {
                        // import foo, * as foo
                        specifiers.push(parseImportNamespaceSpecifier());
                    } else if (match('{')) {
                        // import foo, {bar}
                        specifiers = specifiers.concat(parseNamedImports());
                    } else {
                        throwUnexpectedToken(lookahead);
                    }
                }
            } else {
                throwUnexpectedToken(lex());
            }

            if (!matchContextualKeyword('from')) {
                throwError(lookahead.value ?
                        Messages.UnexpectedToken : Messages.MissingFromClause, lookahead.value);
            }
            lex();
            src = parseModuleSpecifier();
        }

        consumeSemicolon();
        return node.finishImportDeclaration(specifiers, src);
    }

    // ECMA-262 15.1 Scripts

    function parseScriptBody() {
        var statement, body = [], token, directive, firstRestricted;

        while (startIndex < length) {
            token = lookahead;
            if (token.type !== Token.StringLiteral) {
                break;
            }

            statement = parseStatementListItem();
            body.push(statement);
            if (statement.expression.type !== Syntax.Literal) {
                // this is not directive
                break;
            }
            directive = source.slice(token.start + 1, token.end - 1);
            if (directive === 'use strict') {
                strict = true;
                if (firstRestricted) {
                    tolerateUnexpectedToken(firstRestricted, Messages.StrictOctalLiteral);
                }
            } else {
                if (!firstRestricted && token.octal) {
                    firstRestricted = token;
                }
            }
        }

        while (startIndex < length) {
            statement = parseStatementListItem();
            /* istanbul ignore if */
            if (typeof statement === 'undefined') {
                break;
            }
            body.push(statement);
        }
        return body;
    }

    function parseProgram() {
        var body, node;

        peek();
        node = new Node();

        body = parseScriptBody();
        return node.finishProgram(body, state.sourceType);
    }

    function filterTokenLocation() {
        var i, entry, token, tokens = [];

        for (i = 0; i < extra.tokens.length; ++i) {
            entry = extra.tokens[i];
            token = {
                type: entry.type,
                value: entry.value
            };
            if (entry.regex) {
                token.regex = {
                    pattern: entry.regex.pattern,
                    flags: entry.regex.flags
                };
            }
            if (extra.range) {
                token.range = entry.range;
            }
            if (extra.loc) {
                token.loc = entry.loc;
            }
            tokens.push(token);
        }

        extra.tokens = tokens;
    }

    function tokenize(code, options, delegate) {
        var toString,
            tokens;

        toString = String;
        if (typeof code !== 'string' && !(code instanceof String)) {
            code = toString(code);
        }

        source = code;
        index = 0;
        lineNumber = (source.length > 0) ? 1 : 0;
        lineStart = 0;
        startIndex = index;
        startLineNumber = lineNumber;
        startLineStart = lineStart;
        length = source.length;
        lookahead = null;
        state = {
            allowIn: true,
            allowYield: true,
            labelSet: {},
            inFunctionBody: false,
            inIteration: false,
            inSwitch: false,
            lastCommentStart: -1,
            curlyStack: []
        };

        extra = {};

        // Options matching.
        options = options || {};

        // Of course we collect tokens here.
        options.tokens = true;
        extra.tokens = [];
        extra.tokenValues = [];
        extra.tokenize = true;
        extra.delegate = delegate;

        // The following two fields are necessary to compute the Regex tokens.
        extra.openParenToken = -1;
        extra.openCurlyToken = -1;

        extra.range = (typeof options.range === 'boolean') && options.range;
        extra.loc = (typeof options.loc === 'boolean') && options.loc;

        if (typeof options.comment === 'boolean' && options.comment) {
            extra.comments = [];
        }
        if (typeof options.tolerant === 'boolean' && options.tolerant) {
            extra.errors = [];
        }

        try {
            peek();
            if (lookahead.type === Token.EOF) {
                return extra.tokens;
            }

            lex();
            while (lookahead.type !== Token.EOF) {
                try {
                    lex();
                } catch (lexError) {
                    if (extra.errors) {
                        recordError(lexError);
                        // We have to break on the first error
                        // to avoid infinite loops.
                        break;
                    } else {
                        throw lexError;
                    }
                }
            }

            tokens = extra.tokens;
            if (typeof extra.errors !== 'undefined') {
                tokens.errors = extra.errors;
            }
        } catch (e) {
            throw e;
        } finally {
            extra = {};
        }
        return tokens;
    }

    function parse(code, options) {
        var program, toString;

        toString = String;
        if (typeof code !== 'string' && !(code instanceof String)) {
            code = toString(code);
        }

        source = code;
        index = 0;
        lineNumber = (source.length > 0) ? 1 : 0;
        lineStart = 0;
        startIndex = index;
        startLineNumber = lineNumber;
        startLineStart = lineStart;
        length = source.length;
        lookahead = null;
        state = {
            allowIn: true,
            allowYield: true,
            labelSet: {},
            inFunctionBody: false,
            inIteration: false,
            inSwitch: false,
            lastCommentStart: -1,
            curlyStack: [],
            sourceType: 'script'
        };
        strict = false;

        extra = {};
        if (typeof options !== 'undefined') {
            extra.range = (typeof options.range === 'boolean') && options.range;
            extra.loc = (typeof options.loc === 'boolean') && options.loc;
            extra.attachComment = (typeof options.attachComment === 'boolean') && options.attachComment;

            if (extra.loc && options.source !== null && options.source !== undefined) {
                extra.source = toString(options.source);
            }

            if (typeof options.tokens === 'boolean' && options.tokens) {
                extra.tokens = [];
            }
            if (typeof options.comment === 'boolean' && options.comment) {
                extra.comments = [];
            }
            if (typeof options.tolerant === 'boolean' && options.tolerant) {
                extra.errors = [];
            }
            if (extra.attachComment) {
                extra.range = true;
                extra.comments = [];
                extra.bottomRightStack = [];
                extra.trailingComments = [];
                extra.leadingComments = [];
            }
            if (options.sourceType === 'module') {
                // very restrictive condition for now
                state.sourceType = options.sourceType;
                strict = true;
            }
        }

        try {
            program = parseProgram();
            if (typeof extra.comments !== 'undefined') {
                program.comments = extra.comments;
            }
            if (typeof extra.tokens !== 'undefined') {
                filterTokenLocation();
                program.tokens = extra.tokens;
            }
            if (typeof extra.errors !== 'undefined') {
                program.errors = extra.errors;
            }
        } catch (e) {
            throw e;
        } finally {
            extra = {};
        }

        return program;
    }

    // Sync with *.json manifests.
    exports.version = '2.7.3';

    exports.tokenize = tokenize;

    exports.parse = parse;

    // Deep copy.
    /* istanbul ignore next */
    exports.Syntax = (function () {
        var name, types = {};

        if (typeof Object.create === 'function') {
            types = Object.create(null);
        }

        for (name in Syntax) {
            if (Syntax.hasOwnProperty(name)) {
                types[name] = Syntax[name];
            }
        }

        if (typeof Object.freeze === 'function') {
            Object.freeze(types);
        }

        return types;
    }());

}));
/* vim: set sw=4 ts=4 et tw=80 : */

//=================================
//Additional code to convert to ES6 module
if(exports$1 != module$1.exports) exports$1 = module$1.exports;

//=================================

/** This function parses the code and returns a table that gives the variable use
 * in the passed function. The var info table has the following content
 * - it is a map with an entry for each variable accessed. (This refers just to
 * a variable and not to field access on that variable.
 * - the key for an entry is the name of the variable
 * - for each entry there is an array of usages. Each usage as the following info:
 * -- nameUse.path: an array of names constructing the field accessed.
   -- nameUse.scope: a reference to a scope object
   -- nameUse.node: the AST node that identifies this variable
   -- nameUse.isLocal: true if this is a reference to a local variable
   -- nameUse.decalredScope: for local variables only, gives the scope in which the lcoal variable is declared.
 * - additionally, there is a flag indicating if all uses of a name are local variables
 * -- isLocal: true if all uses of a varaible entry are local variables
 **/ 

/** Syntax for AST, names from Esprima.
 * Each entry is a list of nodes inside a node of a given type. the list
 * contains entries with the given fields:
 * {
 *     name:[the name of the field in the node]
 *     list:[true if the field is a list of nodes]
 *     declaration:[boolean indicating if the field corrsponds to a field declaration]
 * @private */
const syntax = {
    AssignmentExpression: [{name:'left'},{name:'right'}],
    ArrayExpression: [{name:'elements',list:true}],
    ArrayPattern: [{name:'elements',list:true}],
    ArrowFunctionExpression: [{name:'params',list:true,declaration:true},{name:'body'},{name:'defaults',list:true}],
    BlockStatement: [{name:'body',list:true}],
    BinaryExpression: [
        {name:'left'},
        {name:'right'}
        //I'm not sure I know all of these. Some may modify the object but we will skip that check here
    ],         
    BreakStatement: [],
    CallExpression: [{name:'callee'},{name:'arguments',list:true}],
    CatchClause: [
        {name:'param',declaration:true},
        {name:'body'}
        //guards omitted - moz specific
    ],
    ConditionalExpression: [{name:'test'},{name:'alternate'},{name:'consequent'}],
    ContinueStatement: [],
    DoWhileStatement: [{name:'body'},{name:'test',list:true}],
    EmptyStatement: [],
    ExpressionStatement: [{name:'expression'}],
    ForStatement: [{name:'init'},{name:'test'},{name:'update',list:true},{name:'body'}],
    ForOfStatement: [{name:'left'},{name:'right'},{name:'body'}],
    ForInStatement: [{name:'left'},{name:'right'},{name:'body'}],
    FunctionDeclaration: [
        {name:'id',declaration:true},
        {name:'params',list:true,declaration:true},
        {name:'body'}
        //no supporting default functions values
    ],
    FunctionExpression: [
        {name:'id',declaration:true},
        {name:'params',list:true,declaration:true},
        {name:'body'}
        //no supporting default functions values
    ],
    Identifier: [], //this is handled specially
    IfStatement: [{name:'test'},{name:'consequent'},{name:'alternate'}],
    Literal: [],
    LabeledStatement: [{name:'body'}],
    LogicalExpression: [{name:'left'},{name:'right'}],
    MemberExpression: [], //this handled specially
    NewExpression: [{name:'callee'},{name:'arguments',list:true}],
    Program: [{name:'body',list:true}],
    Property: [{name:'key'},{name:'value'}], //this is handled specially
    ReturnStatement: [{name:'argument'}],
    RestElement: [{name:'argument'}],
    SequenceExpression: [{name:'expressions',list:true}],
    ObjectExpression: [{name:'properties',list:true}], //this is handled specially 
    ObjectPattern: [{name:'properties',list:true}], 
    SpreadElement: [{name:'argument'}],
    SwitchCase: [{name:'test'},{name:'consequent',list:true}],
    SwitchStatement: [{name:'discriminant'},{name:'cases',list:true}],
    TemplateElement: [],
    TemplateLiteral: [{name:'quasis',list:true},{name:'expressions',list:true}],
    ThisExpression: [],
    ThrowStatement: [{name:'argument'}],
    TryStatement: [
        {name:'block'},
        {name:'handler'},
        {name:'finalizer',list:true}
        //guards omitted, moz specific
    ],
    UnaryExpression: [
        {name:'argument'}
        //the delete operator modifies, but we will skip that error check here
        //"-" | "+" | "!" | "~" | "typeof" | "void" | "delete"
    ],
    UpdateExpression: [{identifierNode:'argument'}],
    VariableDeclaration: [{name:'declarations',list:true,declaration:true}],
    VariableDeclarator: [{name:'id',declaration:true},{name:'init'}],
    WhileStatement: [{name:'body'},{name:'test',list:true}],
    WithStatement: [{name:'object'},{name:'body'}],
    YieldExpression: [
        {name:'argument'}
        //moz spidermonkey specific
    ],

    

    //no support
    AssignmentPattern: null,
    ClassBody: null,
    ClassDeclaration: null,
    ClassExpression: null,
    DebuggerStatement: null,
    ExportAllDeclaration: null,
    ExportDefaultDeclaration: null,
    ExportNamedDeclaration: null,
    ExportSpecifier: null,
    ImportDeclaration: null,
    ImportDefaultSpecifier: null,
    ImportNamespaceSpecifier: null,
    ImportSpecifier: null,
    MetaProperty: null,
    MethodDefinition: null,
    Super: null,
    TaggedTemplateExpression: null

    //if we allowed module import, it would look like this I think
    //but we can not do this in a function, only a module
    //as of the time of this writing, esprima did not support parsing dynamic es6 imports
    // ImportDeclaration: [{name:'specifiers',list:true},{name:'source'}],
    // ImportDefaultSpecifier: [{name:'local'}],
    // ImportNamespaceSpecifier: [{name:'local'}],
    // ImportSpecifier: [{name:'local'},{name:'imported'}],
    
};

/** These are javascript keywords */


/** These are variable names we will not call out in setting the context.
 * NOTE - it is OK if we do not exclude a global variable. It will still work. */
const EXCLUSION_NAMES = {
    "undefined": true,
    "Infinity": true,
    "NaN": true,
    
    "String": true,
    "Number": true,
    "Math": true,
    "Date": true,
    "Array": true,
    "Boolean": true,
    "Error": true,
    "RegExp": true,
    
    "console": true
};

////////////////////////////////////////////////////////////////////////////////
/** This method returns the error list for this formula. It is only valid
 * after a failed call to analyzeCode. 
 *
 *  Error format: (some fields may not be present)
 *  {
 *      "description":String, //A human readable description of the error
 *      "lineNumber":Integer, //line of error, with line 0 being the function declaration, and line 1 being the start of the formula
 *      "index":Integer, //the character number of the error, including the function declaration:  "function() {\n" 
 *      "column":Integer, //the column of the error
 *      "stack":String, //an error stack
 *  }
 * */
////////////////////////////////////////////////////////////////////////////////

/** This method parses the code and returns a list of variabls accessed. It throws
 * an exception if there is an error parsing.
 **/
function analyzeCode(functionText) {
    
    try {
        var returnValue = {};
        var ast = exports$1.parse(functionText, { tolerant: true, loc: true });
    
        //check for errors in parsing
        if((ast.errors)&&(ast.errors.length > 0)) {
            returnValue.success = false;
            returnValue.errors = [];
            for(var i = 0; i < ast.errors.length; i++) {
                var astError = ast.errors[i];
                var actionError = new ActionError(astError.description,"Analyze - Code");
                actionError.setParentException(astError);
                returnValue.errors.push(actionError);
            }
        }
        
        //get the variable list
        var varInfo = getVariableInfo(ast);

        //return the variable info
        returnValue.success = true;
        returnValue.varInfo = varInfo;
        return returnValue;
    }
    catch(exception) {
        var actionError = ActionError.processException(exception,"Analyze - Code",false);
        returnValue.success = false;
        returnValue.errors = [];
        returnValue.errors.push(actionError);
        return returnValue;
    }
}

/** This method analyzes the AST to find the variabls accessed from the formula.
 * This is done to find the dependencies to determine the order of calculation. 
 * 
 * - The tree is composed of nodes. Each nodes has a type which correspondds to
 * a specific statement or other program syntax element. In particular, some
 * nodes correspond to variables, which we are collecting here.
 * - The variables are in two types of nodes, a simple Identifier node or a
 * MemberExpression, which is a sequence of Identifers.
 * - If the variable is a table, then this table is stored in the "depends on map"
 * - In addition to determining which variables a fucntion depends on, some modifiers
 * are also collected for how the variable is used. 
 * -- is declaration - this node should contain an identifier that is a declaration
 * of a local variable
 * @private */
function getVariableInfo(ast) {
    
    //create the var to hold the parse data
    var processInfo = {};
    processInfo.nameTable = {};
    processInfo.scopeTable = {};
    
    //create the base scope
    var scope = startScope(processInfo);

    //traverse the tree, recursively
    processTreeNode(processInfo,ast,false);
    
    //finish the base scope
    endScope(processInfo,scope);
    
    //finish analyzing the accessed variables
    markLocalVariables(processInfo);
    
    //return the variable names accessed
    return processInfo.nameTable;
}
    
/** This method starts a new loca variable scope, it should be called
 * when a function starts. 
 * @private */
function startScope(processInfo) {
    //initailize id gerneator
    if(processInfo.scopeIdGenerator === undefined) {
        processInfo.scopeIdGenerator = 0;
    }
    
    //create scope
    var scope = {};
    scope.id = String(processInfo.scopeIdGenerator++);
    scope.parent = processInfo.currentScope;
    scope.localVariables ={};
    
    //save this as the current scope
    processInfo.scopeTable[scope.id] = scope;
    processInfo.currentScope = scope;
}

/** This method ends a local variable scope, reverting to the parent scope.
 * It should be called when a function exits. 
 * @private */
function endScope(processInfo) {
    var currentScope = processInfo.currentScope;
    if(!currentScope) return;
    
    //set the scope to the parent scope.
    processInfo.currentScope = currentScope.parent;
}

/** This method analyzes the AST (abstract syntax tree). 
 * @private */
function processTreeNode(processInfo,node,isDeclaration) {
    
    //process the node type
    if((node.type == "Identifier")||(node.type == "MemberExpression")) {
        //process a variable
        processVariable(processInfo,node,isDeclaration);
    } 
    else if((node.type == "FunctionDeclaration")||(node.type == "FunctionExpression")) {
        //process the functoin
        processFunction(processInfo,node);
        
    }
    else if((node.type === "NewExpression")&&(node.callee.type === "Function")) {
        //we currently do not support the function constructor
        //to add it we need to add the local variables and parse the text body
        throw createParsingError("Function constructor not currently supported!",node.loc); 
    }
    else {
        //process some other node
        processGenericNode(processInfo,node);
    }
}
   
/** This method process nodes that are not variabls identifiers. This traverses 
 * down the syntax tree.
 * @private */
function processGenericNode(processInfo,node) {
    //load the syntax node info list for this node
    var nodeInfoList = syntax[node.type];
    
    //process this list
    if(nodeInfoList === undefined) {
        //node not found
        throw createParsingError("Syntax Tree Node not found: " + node.type,node.loc);
    }
    else if(nodeInfoList === null) {
        //node not supported
        throw createParsingError("Syntax node not supported: " + node.type,node.loc);
    }
    else {
        //this is a good node - process it

        //-------------------------
        // process the node list
        //-------------------------
        for(var i = 0; i < nodeInfoList.length; i++) {
            //get node info
            var nodeInfo = nodeInfoList[i];
            
            //check if this field exists in node
            var childField = node[nodeInfo.name];
            if(childField) {
                
                if(nodeInfo.list) {
                    //this is a list of child nodes
                    for(var j = 0; j < childField.length; j++) {
                        processTreeNode(processInfo,childField[j],nodeInfo.declaration);
                    }
                }
                else {
                    //this is a single node
                    processTreeNode(processInfo,childField,nodeInfo.declaration);
                }
            }
        }
    }
}

/** This method processes nodes that are function. For functions a new scope is created 
 * for the body of the function.
 * @private */
function processFunction(processInfo,node) {
    var nodeType = node.type;
    var idNode = node.id;
    var params = node.params;
    var body = node.body;
    
    //difference here between the declaration and expression
    // - in declaration the name of the function is a variable in the parent scope
    // - in expression the name is typically left of. But it can be included, in which case
    //   it is a variable only in the child (function) scope. This lets the function call
    //   itself.
    
    if((nodeType === "FunctionDeclaration")&&(idNode)) {
        //parse id node (variable name) in the parent scope
        processTreeNode(processInfo,idNode,true);
    }
    
    //create a new scope for this function
    var scope = startScope(processInfo);
    
    if((nodeType === "FunctionExpression")&&(idNode)) {
        //parse id node (variable name) in the parent scope
        processTreeNode(processInfo,idNode,true);
    }
    
    //process the variable list
    for(var i = 0; i < params.length; i++) {
        processTreeNode(processInfo,params[i],true);
    }
    
    //process the function body
    processTreeNode(processInfo,body,false);
    
    //end the scope for this function
    endScope(processInfo,scope);
}

/** This method processes nodes that are variables (identifiers and member expressions), adding
 * them to the list of variables which are used in tehe formula.
 * @private */
function processVariable(processInfo,node,isDeclaration) {
    
    //get the variable path and the base name
    var namePath = getVariableDotPath(processInfo,node);
    if(!namePath) return;
    
    var baseName = namePath[0];
    
    //check if it is an excluded name - such as a variable name used by javascript
    if(EXCLUSION_NAMES[baseName]) {
        return;
    }
    
    //add to the name table
    var nameEntry = processInfo.nameTable[baseName];
    if(!nameEntry) {
        nameEntry = {};
        nameEntry.name = baseName;
        nameEntry.uses = [];
        
        processInfo.nameTable[baseName] = nameEntry;
    }
    
    //add a name use entry
    var nameUse = {};
    nameUse.path = namePath;
    nameUse.scope = processInfo.currentScope;
    nameUse.node = node;
    
    nameEntry.uses.push(nameUse);
    
    //if this is a declaration store it as a local varaible
    if(isDeclaration) {
        //store this in the local variables for this scope
        var scopeLocalVariables = processInfo.currentScope.localVariables;
        if(!scopeLocalVariables[baseName]) {
            scopeLocalVariables[baseName] = true;
        }
        else {
            //the variable is being redeclared! that is ok.
        }
    }
}

/** This method returns the variable and its fields which are given by the node.
 * It may return null, meaning there is no variable to add to the dependency.  
 * See notes embedded in the code. It is possible to fool this into making a
 * dependecne on a parent (and all children) when all that is required is a 
 * single child. 
 * @private */
function getVariableDotPath(processInfo,node) {
    if(node.type == "Identifier") {
        //read the identifier name
        return [node.name];
    }
    else if(node.type == "MemberExpression") {
        if((node.object.type == "MemberExpression")||(node.object.type == "Identifier")) {
            //MEMBER EXPRESSION OR IDENTIFIER - variable name and/or path
            var variable = getVariableDotPath(processInfo,node.object);

            if(node.computed) {
                //COMPUTED CASE
                //We will not try to figure out what the child is. We will only make a dependence on 
                //the parent. This should work but it is too strong. For example
                //we may be including dependence on a while folder when really we depend
                //on a single child in the folder.
                processTreeNode(processInfo,node.property,false);
            }
            else {
                //append the member expression property to it
                variable.push(node.property.name);
            }

            return variable;
        }
        else {
            //something other than a variable as the object for the member expressoin
            //ignore the variable path after the call. We will set a dependence
            //on the parent which should work but is too strong. For example
            //we may be including dependence on a while folder when really we depend
            //on a single child in the folder.
            processTreeNode(processInfo,node.object,false);
            
            return null;
        }
    }
    else {
        //this shouldn't happen. If it does we didn't code the syntax tree right
        throw createParsingError("Unknown application error: expected a variable identifier node.",node.loc);
    }
}

/** This method annotates the variable usages that are local variables. 
 * @private */
function markLocalVariables(processInfo) {
    for(var key in processInfo.nameTable) {
        var nameEntry = processInfo.nameTable[key];
        var name = nameEntry.name;
        var existNonLocal = false;
        for(var i = 0; i < nameEntry.uses.length; i++) {
            var nameUse = nameEntry.uses[i];
            var scope = nameUse.scope;
            //check if this name is a local variable in this scope or a parent scope
            var varScope = null;
            for(var testScope = scope; testScope; testScope = testScope.parent) {
                if(testScope.localVariables[name]) {
                    varScope = testScope;
                    break;
                }
            }
            if(varScope) {
                //this is a local variable
                nameUse.isLocal = true;
                nameUse.declarationScope = varScope;
            }
            else {
                existNonLocal = true;
            }
        }
        //add a flag to the name enry if all uses are local
        if(!existNonLocal) {
            nameEntry.isLocal = true;
        }
    }
}


/** This method creates an error object. 
 * format:
 * {
 *     description:[string description],
 *     lineNumber:[integer line number, including function declaration line prepended to formula],
 *     column;[integer column on line number]
 * }
 * @private */
function createParsingError(errorMsg,location) {
    var error = base$1.createError(errorMsg,false);
    if(location) {
        error.lineNumber = location.start.line;
        error.column = location.start.column;
    }
    return error;
}

/** This function validates a table name. It returns 
 * [valid,errorMsg]. */


/** This method analyzes the code and creates the object function and dependencies. 
 * The results are loaded into the passed object processedCodeData. */
function processCode(codeInfo,codeLabel) {
    
    //analyze the code
    var combinedFunctionBody = createCombinedFunctionBody(
        codeInfo.argList, 
        codeInfo.functionBody, 
        codeInfo.supplementalCode, 
        codeLabel);
        
    //get the accessed variables
    //
    //parse the code and get variable dependencies
    var effectiveCombinedFunctionBody = MEMBER_LOCALS_TEXT + combinedFunctionBody;
    var analyzeOutput = analyzeCode(effectiveCombinedFunctionBody);
    
    var compiledInfo = {};
    
    if(analyzeOutput.success) {
        compiledInfo.varInfo = analyzeOutput.varInfo;
    }
    else {
        compiledInfo.errors = analyzeOutput.errors;
        return compiledInfo;
    }

    //this generator creates two functions - a function that creates the member function
    //and function that initializes external variables for that member fuction.
    var generatorFunction = createGeneratorFunction(compiledInfo.varInfo, combinedFunctionBody);
    compiledInfo.generatorFunction = generatorFunction;
    
    return compiledInfo;   
}


/** This method creates the user code object function body. 
 * @private */
function createCombinedFunctionBody(argList,
        functionBody, 
        supplementalCode,
        codeLabel) {
    
    var argListString = argList.join(",");
    
    //create the code body
    var combinedFunctionBody = util.formatString(
        MEMBER_FUNCTION_FORMAT_TEXT,
		codeLabel,
        argListString,
        functionBody,
        supplementalCode
    );
        
    return combinedFunctionBody;
}

/** This method creates (1) a closure function that returns another generator function
 * which makes the member function and (2) a function that initializes any external 
 * variables needed in the member function.
 * This closure wraps the variables that are external to this member, meaning other
 * members in the model.
 * This initializer function allows the code to be compiled once and then used with different
 * values for other data in the model.
 * The generator that makes the member function is a closure to wrap the member private
 * code and any other needed data with the member function.
 * @private */
function createGeneratorFunction(varInfo, combinedFunctionBody) {
    
    var contextDeclarationText = "";
    var initializerBody = "";
    
    //set the context - here we only defined the variables that are actually used.
	for(var baseName in varInfo) {        
        var baseNameInfo = varInfo[baseName];
        
        //do not add context variable for local or "returnValue", which is explicitly defined
        if((baseName === "returnValue")||(baseNameInfo.isLocal)) continue;
        
        //add a declaration
        contextDeclarationText += "var " + baseName + ";\n";
        
        //add to the context setter
        initializerBody += baseName + ' = contextManager.getValue("' + baseName + '");\n';
    }
    
    //create the generator for the object function
    var generatorBody = util.formatString(
        GENERATOR_FUNCTION_FORMAT_TEXT,
		contextDeclarationText,
        initializerBody,
        combinedFunctionBody
    );
        
    var generatorFunction = new Function("apogeeMessenger",generatorBody);
    return generatorFunction;    
}


/** This is the format string to create the code body for the object function
 * Input indices:
 * 0: unique member name
 * 1: function argument list with parentheses
 * 2: member formula text
 * 3: supplemental code text
 * 
 * @private
 */
const MEMBER_FUNCTION_FORMAT_TEXT = [
"//{0}",
"",
"//supplemental code--------------",
"{3}",
"//end supplemental code----------",
"",
"//member function----------------",
"function __memberFunction({1}) {",
"//overhead code",
"__memberFunctionDebugHook('{0}');",
"",
"//user code",
"{2}",
"};",
"//end member function------------",
   ].join("\n");
   
/** This line is added when getting the dependencies to account for some local 
 * variables in the member function.
 * @private */
const MEMBER_LOCALS_TEXT = "var apogeeMessenger, __memberFunction, __memberFunctionDebugHook;";
   
/** This is the format string to create the code body for the object function
 * Input indices:
 * 0: context declaration text
 * 1: context setter body
 * 2: object function body
 * @private
 */
const GENERATOR_FUNCTION_FORMAT_TEXT = [
"'use strict'",
"//declare context variables",
"{0}",
"//context setter",
"function __initializer(contextManager) {",
"{1}};",
"",
"//user code",
"function __memberGenerator() {",
"{2}",
"return __memberFunction",
"}",
"return {",
"'memberGenerator': __memberGenerator,",
"'initializer': __initializer",
"};"
   ].join("\n");

/** This method takes the varInfo table from the code analysis and returns
 * a lit of member objects which this member depends on.
 */
function getDependencyInfo(varInfo,contextManager) {
    var dependencyList = [];
	var objectMap = {};
	
	//cycle through the variables used
	for(var baseName in varInfo) {
			
        //for each use of this name that is not local, find the referenced object
        var nameEntry = varInfo[baseName];
        for(var i = 0; i < nameEntry.uses.length; i++) {
            var nameUse = nameEntry.uses[i];
            if(!nameUse.isLocal) {
                //look up the object
                var namePath = nameUse.path;

                //lookup this object
                var impactor = contextManager.getMember(namePath);
                if(impactor) {

                    //add as dependent (note this may not be a data object - check later!)
                    var memberId = impactor.getId();
                    if(!objectMap[memberId]) {
                        dependencyList.push(impactor);
                        objectMap[memberId] = true;
                    }
                }
            }
		}
	}
	
	return dependencyList;
}

/** This mixin encapsulates an object in that can be coded. It contains a function
 * and supplemental code. Object that are codeable should also be a member and
 * dependent.
 * 
 * This is a mixin and not a class. It is used in the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A Codeable must be a Member.
 * - A Codeable must be Dependent. 
 * - A Codeable must be ContextHolder
 * 
 * FIELD NAMES (from update event):
 * - argList
 * - functionBody
 * - private
 * - description
 */
let Codeable = {};
/** This initializes the component. argList is the arguments for the object function. */
Codeable.init = function(argList) {
    
    //arguments of the member function
    if(argList) {
        this.argList = argList;
    }
    else {
        this.argList = [];
    }
    
    //initialze the code as empty
    this.codeSet = false;
    this.functionBody = "";
    this.supplementalCode = "";
    this.description = "";
    this.varInfo = null;
    this.dependencyInfo = null;
    this.memberFunctionInitializer = null;
    this.memberGenerator = null;
    this.codeErrors = [];
    
    this.clearCalcPending();
    this.setResultPending(false);
    this.setResultInvalid(false);
    
    //set field updated in init
    this.fieldUpdated("argList");
    this.fieldUpdated("functionBody");
    this.fieldUpdated("private");
    
    //fields used in calculation
    this.dependencyInitInProgress = false;
    this.functionInitialized = false;
    this.initReturnValue = false;
};

/** This property tells if this object is a codeable.
 * This property should not be implemented on non-codeables. */
Codeable.isCodeable = true;

Codeable.getSetCodeOk = function() {
    return this.generator.setCodeOk;
};

/** This method returns the argument list.  */
Codeable.getArgList = function() {
    return this.argList;
};

/** This method returns the fucntion body for this member.  */
Codeable.getFunctionBody = function() {
    return this.functionBody;
};

/** This method returns the supplemental code for this member.  */
Codeable.getSupplementalCode = function() {
    return this.supplementalCode;
};

/** This method returns the supplemental code for this member.  */
Codeable.getDescription = function() {
    return this.description;
};

/** This method returns the supplemental code for this member.  */
Codeable.setDescription = function(description) {
    this.fieldUpdated("description");
    this.description = description;
};

/** This method returns the formula for this member.  */
Codeable.setCodeInfo = function(codeInfo,compiledInfo) {

    //set the base data
    if(this.argList.toString() != codeInfo.argList.toString()) {
        this.fieldUpdated("argList");
        this.argList = codeInfo.argList;
    }
    
    if(this.functionBody != codeInfo.functionBody) {
        this.fieldUpdated("functionBody");
        this.functionBody = codeInfo.functionBody;
    }
    
    if(this.supplementalCode != codeInfo.supplementalCode) {
        this.fieldUpdated("private");
        this.supplementalCode = codeInfo.supplementalCode;
    }

    //save the variables accessed
    this.varInfo = compiledInfo.varInfo;

    if((!compiledInfo.errors)||(compiledInfo.errors.length === 0)) {
        //set the code  by exectuing generator
        this.codeErrors = [];
        
        try {
            //get the inputs to the generator
            var messenger = new Messenger(this);
            
            //get the generated fucntion
            var generatedFunctions = compiledInfo.generatorFunction(messenger);
            this.memberGenerator = generatedFunctions.memberGenerator;
            this.memberFunctionInitializer = generatedFunctions.initializer;                       
        }
        catch(ex) {
            this.codeErrors.push(ActionError.processException(ex,"Codeable - Set Code",false));
        }
    }
    else {
//doh - i am throwing away errors - handle this differently!
        this.codeErrors = compiledInfo.errors;
    }
    
    if(this.codeErrors.length > 0) {
        //code not valid
        this.memberGenerator = null;
        this.memberFunctionInitializer = null;
    }
    this.codeSet = true;
};

/** This is a helper method that compiles the code as needed for setCodeInfo.*/
Codeable.applyCode = function(argList,functionBody,supplementalCode) {
    
    var codeInfo ={};
    codeInfo.argList = argList;
    codeInfo.functionBody = functionBody;
    codeInfo.supplementalCode = supplementalCode;
    
    //load some needed context variables
    var codeLabel = this.getFullName();
    
    //process the code text into javascript code
    var compiledInfo = processCode(codeInfo,
        codeLabel);

    //save the code
    this.setCodeInfo(codeInfo,compiledInfo);
};

/** This method returns the formula for this member.  */
Codeable.initializeDependencies = function() {
    
    if((this.hasCode())&&(this.varInfo)&&(this.codeErrors.length === 0)) {
        try {
            var newDependencyList = getDependencyInfo(this.varInfo,
                   this.getContextManager());

            //update dependencies
            this.updateDependencies(newDependencyList);
        }
        catch(ex) {
            this.codeErrors.push(ActionError.processException(ex,"Codeable - Set Dependencies",false));
        }
    }
    else {
        //will not be calculated - has no dependencies
        this.updateDependencies([]);
    }
};

/** This method udpates the dependencies if needed because
 *the passed variable was added.  */
Codeable.updateDependeciesForModelChange = function(recalculateList) {
    if((this.hasCode())&&(this.varInfo)) {
                  
        //calculate new dependencies
        var newDependencyList = getDependencyInfo(this.varInfo,
               this.getContextManager());
          
        //update the dependency list
        var dependenciesChanged = this.updateDependencies(newDependencyList);
        if(dependenciesChanged) {
            //add to update list
            addToRecalculateList(recalculateList,this);
        }  
    }
};
    
/** This method returns the formula for this member.  */
Codeable.clearCode = function() {
    this.codeSet = false;
    if(this.functionBody != "") {
        this.fieldUpdated("functionBody");
        this.functionBody = "";
    }
    if(this.supplementalCode != "") {
        this.fieldUpdated("private");
        this.supplementalCode = "";
    }
    this.varInfo = null;
    this.dependencyInfo = null;
    this.memberFunctionInitializer = null;
    this.memberGenerator = null;
    this.codeErrors = [];
    
    this.clearCalcPending();
    this.setResultPending(false);
    this.setResultInvalid(false);
    
    var newDependsOn = [];
	this.updateDependencies(newDependsOn);
};

/** This method returns the formula for this member.  */
Codeable.hasCode = function() {
    return this.codeSet;
};

/** If this is true the member is ready to be executed. 
 * @private */
Codeable.needsCalculating = function() {
	return this.codeSet;
};

/** This does any init needed for calculation.  */
Codeable.prepareForCalculate = function() {
    //call the base function
    Dependent$1.prepareForCalculate.call(this);
    
    this.functionInitialized = false;
    this.initReturnValue = false;
};

/** This method sets the data object for the member.  */
Codeable.calculate = function() {
    if(this.codeErrors.length > 0) {
        this.addErrors(this.codeErrors);
        this.clearCalcPending();
        return;
    }
    
    if((!this.memberGenerator)||(!this.memberFunctionInitializer)) {
        var msg = "Function not found for member: " + this.getName();
        var actionError = new ActionError(msg,"Codeable - Calculate",this);
        this.addError(actionError);
        this.clearCalcPending();
        return;
    } 
    
    try {
        this.processMemberFunction(this.memberGenerator);
    }
    catch(error) {
        if(error == base$1.MEMBER_FUNCTION_INVALID_THROWABLE) {
            //This is not an error. I don't like to throw an error
            //for an expected condition, but I didn't know how else
            //to do this. See notes where this is thrown.
            this.setResultInvalid(true);
        }
        else if(error == base$1.MEMBER_FUNCTION_PENDING_THROWABLE) {
            //This is not an error. I don't like to throw an error
            //for an expected condition, but I didn't know how else
            //to do this. See notes where this is thrown.
            this.setResultPending(true);
        }
        //--------------------------------------
        else {
            //normal error in member function execution
        
            //this is an error in the code
            if(error.stack) {
                console.error(error.stack);
            }

            var errorMsg = (error.message) ? error.message : "Unknown error";
            var actionError = new ActionError(errorMsg,"Codeable - Calculate",this);
            actionError.setParentException(error);
            this.addError(actionError);
        }
    }
    
    this.clearCalcPending();
};

/** This makes sure user code of object function is ready to execute.  */
Codeable.memberFunctionInitialize = function() {
    
    if(this.functionInitialized) return this.initReturnValue;
    
    //make sure this in only called once
    if(this.dependencyInitInProgress) {
        var errorMsg = "Circular reference error";
        var actionError = new ActionError(errorMsg,"Codeable - Calculate",this);
        this.addError(actionError);
        //clear calc in progress flag
        this.dependencyInitInProgress = false;
        this.functionInitialized = true;
        this.initReturnValue = false;
        return this.initReturnValue;
    }
    this.dependencyInitInProgress = true;
    
    try {
        
        //make sure the data is set in each impactor
        this.initializeImpactors();
        if((this.hasError())||(this.getResultPending())||(this.getResultInvalid())) {
            this.dependencyInitInProgress = false;
            this.functionInitialized = true;
            this.initReturnValue = false;
            return this.initReturnValue;
        }
        
        //set the context
        this.memberFunctionInitializer(this.getContextManager());
        
        this.initReturnValue = true;
    }
    catch(error) {
        //this is an error in the code
        if(error.stack) {
            console.error(error.stack);
        }
        var errorMsg = (error.message) ? error.message : "Unknown error";
        var actionError = new ActionError(errorMsg,"Codeable - Calculate",this);
        actionError.setParentException(error);
        this.addError(actionError);
        this.initReturnValue = false;
    }
    
    this.dependencyInitInProgress = false;
    this.functionInitialized = true;
    return this.initReturnValue;
};

//------------------------------
// Member Methods
//------------------------------

/** This gets an update structure to upsate a newly instantiated member
/* to match the current object. */
Codeable.getUpdateData = function() {
    var updateData = {};
    if(this.hasCode()) {
        updateData.argList = this.getArgList();
        updateData.functionBody = this.getFunctionBody();
        updateData.supplementalCode = this.getSupplementalCode();
    }
    else {
        updateData.data = this.getData();
    }
    updateData.description = this.getDescription();
    return updateData;
};

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
Codeable.createContextManager = function() {
    return new ContextManager(this);
};

//===================================
// Private Functions
//===================================

//implementations must implement this function
//This method takes the object function generated from code and processes it
//to set the data for the object. (protected)
//Codeable.processMemberFunction

/** This class encapsulatees a data table for a JSON object */
function JsonTable(name,owner,initialData) {
    //base init
    Member.init.call(this,name,JsonTable.generator);
    Dependent$1.init.call(this);
    ContextHolder.init.call(this);
	Codeable.init.call(this,[],true);
    
    this.initOwner(owner);
    
    //set initial data
    if(!initialData) {
        //default initail value
        initialData = {};
        initialData.data = "";
    }  

    if(initialData.functionBody !== undefined) {
        this.applyCode(initialData.argList,
            initialData.functionBody,
            initialData.supplementalCode);
    }
    else {
        if(initialData.data === undefined) initialData.data = "";
        
        this.setData(initialData.data);
    }
    if(initialData.description !== undefined) {
        this.setDescription(initialData.description);
    }
}

//add components to this class
base$1.mixin(JsonTable,Member);
base$1.mixin(JsonTable,Dependent$1);
base$1.mixin(JsonTable,ContextHolder);
base$1.mixin(JsonTable,Codeable);

//------------------------------
// Codeable Methods
//------------------------------

/** This method returns the argument list. We override it because
 * for JsonTable it gets cleared when data is set. However, whenever code
 * is used we want the argument list to be this value. */
JsonTable.prototype.getArgList = function() {
    return [];
};
	
JsonTable.prototype.processMemberFunction = function(memberGenerator) {
    
    //first initialize
    var initialized = this.memberFunctionInitialize();
    
    var data;
    if(initialized) {
        //the data is the output of the function
        var memberFunction = memberGenerator();
        data = memberFunction();
    }
    else {
        //initialization issue = error or pending dependancy
        data = undefined;
    }
    
    if(data === util.INVALID_VALUE) {
        //value is invalid if return is this predefined value
        this.setResultInvalid(true);
    }
    else if(data instanceof Promise) {
        //if the return value is a Promise, the data is asynch asynchronous!
        this.applyPromiseData(data);
    }
    else {
        //result is normal synchronous data
        this.setData(data); 
    }
};

//------------------------------
// Member Methods
//------------------------------

/** This method extends set data from member. It also
 * freezes the object so it is immutable. (in the future we may
 * consider copying instead, or allowing a choice)*/
JsonTable.prototype.setData = function(data) {
    
	//make this object immutable
	base$1.deepFreeze(data);

	//store the new object
    return Member.setData.call(this,data);
};

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
JsonTable.fromJson = function(owner,json) {
    return new JsonTable(json.name,owner,json.updateData);
};

//============================
// Static methods
//============================

JsonTable.generator = {};
JsonTable.generator.displayName = "Table";
JsonTable.generator.type = "apogee.JsonTable";
JsonTable.generator.createMember = JsonTable.fromJson;
JsonTable.generator.setDataOk = true;
JsonTable.generator.setCodeOk = true;

//register this member
Workspace.addMemberGenerator(JsonTable.generator);

/** This is a function. */
function FunctionTable(name,owner,initialData) {
    //base init
    Member.init.call(this,name,FunctionTable.generator);
    Dependent$1.init.call(this);
    ContextHolder.init.call(this);
	Codeable.init.call(this,argList,false);
    
    this.initOwner(owner);
    
    //set initial data
    var argList = initialData.argList ? initialData.argList : [];
    var functionBody = initialData.functionBody ? initialData.functionBody : "";
    var supplementalCode = initialData.supplementalCode ? initialData.supplementalCode : "";
    this.applyCode(argList,functionBody,supplementalCode);
    if(initialData.description !== undefined) {
        this.setDescription(initialData.description);
    }
}

//add components to this class
base$1.mixin(FunctionTable,Member);
base$1.mixin(FunctionTable,Dependent$1);
base$1.mixin(FunctionTable,ContextHolder);
base$1.mixin(FunctionTable,Codeable);

//------------------------------
// Codeable Methods
//------------------------------

FunctionTable.prototype.processMemberFunction = function(memberGenerator) {
    var memberFunction = this.getLazyInitializedMemberFunction(memberGenerator);
	this.setData(memberFunction);
};

FunctionTable.prototype.getLazyInitializedMemberFunction = function(memberGenerator) {
    var instance = this;

    //create init member function for lazy initialization
    //we need to do this for recursive functions, or else we will get a circular reference
    var initMember = function() {
        var impactorSuccess = instance.memberFunctionInitialize();
        if(impactorSuccess) {
            return memberGenerator();
        }
        else {
            //error handling
            var issue;
            
            //in the case of "result invalid" or "result pending" this is 
            //NOT an error. But I don't know
            //how else to stop the calculation other than throwing an error, so 
            //we do that here. It should be handled by anyone calling a function.
            if(instance.hasError()) {
                issue = new Error("Error in dependency: " + instance.getFullName());

            }
            else if(instance.getResultPending()) {
                issue = base$1.MEMBER_FUNCTION_PENDING_THROWABLE;
            }
            else if(instance.getResultInvalid()) {
                issue = base$1.MEMBER_FUNCTION_INVALID_THROWABLE;
            }
            else {
                issue = new Error("Unknown problem in initializing: " + instance.getFullName());
            }
            
            throw issue;
        } 
    };

    //this is called from separate code to make debugging more readable
    return __functionTableWrapper(initMember);
};

//------------------------------
// Member Methods
//------------------------------

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
FunctionTable.fromJson = function(owner,json) {
    return new FunctionTable(json.name,owner,json.updateData);
};

/** This method extends the base method to get the property values
 * for the property editting. */
FunctionTable.readProperties = function(member,values) {
    var argList = member.getArgList();
    var argListString = argList.toString();
    values.argListString = argListString;
    return values;
};

/** This method executes a property update. */
FunctionTable.getPropertyUpdateAction = function(member,newValues) {
    if((newValues.updateData)&&(newValues.updateData.argList !== undefined)) {
        var actionData = {};
        actionData.action = "updateCode";
        actionData.memberName = member.getFullName();
        actionData.argList = newValues.updateData.argList;
        actionData.functionBody = member.getFunctionBody();
        actionData.supplementalCode = member.getSupplementalCode();
        return actionData;
    }
    else {
        return null;
    }
};

//============================
// Static methods
//============================

FunctionTable.generator = {};
FunctionTable.generator.displayName = "Function";
FunctionTable.generator.type = "apogee.FunctionTable";
FunctionTable.generator.createMember = FunctionTable.fromJson;
FunctionTable.generator.readProperties = FunctionTable.readProperties;
FunctionTable.generator.getPropertyUpdateAction = FunctionTable.getPropertyUpdateAction;
FunctionTable.generator.setDataOk = false;
FunctionTable.generator.setCodeOk = true;

//register this member
Workspace.addMemberGenerator(FunctionTable.generator);

/** This component encapsulates an owner object that is a member and contains children members, creating  a 
 * hierarchical structure in the workspace. Each child has a name and this name
 * forms the index of the child into its parent. (I guess that means it doesn't
 * have to be a string, in the case we made an ArrayFolder, which would index the
 * children by integer.)
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A Parent must be a Member.
 * - A Parent must be an Owner.
 */
let Parent = {};
/** This is the name for the root. */
Parent.ROOT_NAME = "root";

/** This initializes the component */
Parent.init = function() {
    this.childrenWriteable = true;
};

Parent.isParent = true;


/** this is used to identify if this is the root folder. */
Parent.isRoot = function() {
    //undefined may be OK too. If there is populated object this is not root.
    return (this.getParent() == null); 
};

///** this method gets a map of child names to children. This may not be the structure
// * of the data in the parent, but it is the prefered common representation. */
//Parent.getChildMap = function();

// Must be implemented in extending object
///** This method looks up a child from this folder.  */
//Parent.lookupChild = function(name);

/** This method looks up a child using an arry of names corresponding to the
 * path from this folder to the object.  The argument startElement is an optional
 * index into the path array for fodler below the root folder. */
Parent.lookupChildFromPathArray = function(path,startElement) {
    if(startElement === undefined) startElement = 0;
    
    var member = this.lookupChild(path[startElement]);
    if(!member) return undefined;
    
    if(startElement < path.length-1) {
        if(member.isParent) {
            return member.lookupChildFromPathArray(path,startElement+1);
        }
        else if(member.isOwner) {
            return member.getMemberByPathArray(path,startElement+1);
        }
        else {
            return member;
        }
    }
    else {
        return member;
    }
};

/** This method allows the UI to decide if the user can add children to it. This
 * value defaults to true. */
Parent.getChildrenWriteable = function() {
    return this.childrenWriteable;
};

/** This method sets the writeable property for adding child members. This value of
 * the method is not enforced (since children must be added one way or another). */
Parent.setChildrenWriteable = function(writeable) {
    this.childrenWriteable = writeable; 
};

// Must be implemented in extending object
///** This method adds the child to this parent. 
// * It will fail if the name already exists.  */
//Parent.addChild = function(child);

// Must be implemented in extending object
///** This method removes this child from this parent.  */
//Parent.removeChild = function(child);

// Must be implemented in extending object
///** This method updates the data object for this child. */
//Parent.updateData = function(child);

///** This method is called when the workspace is closed. 
//* It should do any needed cleanup for the object. */
//Parent.onClose = function();

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
Parent.createContextManager = function() {
    //set the context manager
    var contextManager = new ContextManager(this);
    //add an entry for this folder. Make it local unless this si a root folder
    var myEntry = {};
    myEntry.parent = this;
    contextManager.addToContextList(myEntry);
    
    return contextManager;
};

//------------------------------
//Owner methods
//------------------------------

/** This method returns the full name in dot notation for this object. */
//Parent.getFullName = function() {
//    return Member.getFullName.call(this);
//}

/** this method gets the hame the children inherit for the full name. */
Parent.getPossesionNameBase = function() {
    return this.getFullName() + ".";
};

/** This is a folder. */
function Folder(name,owner) {
    //base init
    Member.init.call(this,name,Folder.generator);
    Dependent$1.init.call(this);
    ContextHolder.init.call(this);
    Owner.init.call(this);
    Parent.init.call(this);
    
    this.initOwner(owner);

    //this holds the base objects, mapped by name
    this.childMap = {};
    this.dataMap = {};
	
	//make sure the data map is frozen
	Object.freeze(this.dataMap);
    this.setData(this.dataMap);
}

//add components to this class
base$1.mixin(Folder,Member);
base$1.mixin(Folder,Dependent$1);                      
base$1.mixin(Folder,ContextHolder);
base$1.mixin(Folder,Owner);
base$1.mixin(Folder,Parent);

//------------------------------
// Parent Methods
//------------------------------

/** this method gets the table map. */
Folder.prototype.getChildMap = function() {
    return this.childMap;
};

/** This method looks up a child from this folder.  */
Folder.prototype.lookupChild = function(name) {
    //check look for object in this folder
    return this.childMap[name];
};

/** This method adds a table to the folder. It also sets the folder for the
 *table object to this folder. It will fail if the name already exists.  */
Folder.prototype.addChild = function(child) {
	
    //check if it exists first
    var name = child.getName();
    if(this.childMap[name]) {
        //already exists! not fatal since it is not added to the model yet,
        throw base$1.createError("There is already an object with the given name.",false);
    }
    //add object
    this.childMap[name] = child;
    
    var data = child.getData();
    //object may first appear with no data
    if(data !== undefined) {
        this.spliceDataMap(name,data);
    }
    
    //set all children as dependents
    this.calculateDependents();
};

/** This method removes a table from the folder. */
Folder.prototype.removeChild = function(child) {
    //make sure this is a child of this object
	var parent = child.getParent();
    if((!parent)||(parent !== this)) return;
	
    //remove from folder
    var name = child.getName();
    delete(this.childMap[name]);
    this.spliceDataMap(name);
    
    //set all children as dependents
    this.calculateDependents();
};

/** This method updates the table data object in the folder data map. */
Folder.prototype.updateData = function(child) {
	
    var name = child.getName();
    var data = child.getData();
    if(this.childMap[name] === undefined) {
        alert("Error - this table " + name + " has not yet been added to the folder.");
        return;
    }
	this.spliceDataMap(name,data);
};

/** There is no calculation for the folder base on dependents. 
 * @private */
Folder.prototype.needsCalculating = function() {
    return true;
};

/** Calculate the data.  */
Folder.prototype.calculate = function() {
    //we don't need to calculate since the calculate is done on the fly
    //we just need to make sure the impactors are set
    this.initializeImpactors();
    
    this.clearCalcPending();
};

//------------------------------
// Dependent Methods
//------------------------------

/** This method updates the dependencies of any children
 * based on an object being added. */
Folder.prototype.updateDependeciesForModelChange = function(recalculateList) {
    for(var key in this.childMap) {
        var child = this.childMap[key];
        if(child.isDependent) {
            child.updateDependeciesForModelChange(recalculateList);
        }
    }
};

//------------------------------
// Member Methods
//------------------------------

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
Folder.fromJson = function(owner,json) {
    var folder = new Folder(json.name,owner);
    if(json.childrenNotWriteable) {
        folder.setChildrenWriteable(false);
    }
    return folder;
};

/** This method adds any additional data to the json to save for this member. 
 * @protected */
Folder.prototype.addToJson = function(json) {
	json.children = {};
    
    if(!this.getChildrenWriteable()) {
        json.childrenNotWriteable = true;
    }
    
    for(var key in this.childMap) {
        var child = this.childMap[key];
        json.children[key] = child.toJson();
    }
};

Folder.prototype.onClose = function () {
    for(var key in this.childMap) {
        var child = this.childMap[key];
        if(child.onClose) child.onClose();
    }
};

//============================
// Private methods
//============================

/** This method updates the table data object in the folder data map. 
 * @private */
Folder.prototype.calculateDependents = function() {
    var newDependsOn = [];
    for(var name in this.childMap) {
        var child = this.childMap[name];
        newDependsOn.push(child);
    }
    this.updateDependencies(newDependsOn);
};

/** This method creates a new immutable data map, either adding a give name and data or
 * removing a name. To remove a name from the map, leave "addData" as undefined. 
 * @private */
Folder.prototype.spliceDataMap = function(addOrRemoveName,addData) {
	var newDataMap = {};
	
	//copy old data
	for(var key in this.dataMap) {
		if(key !== addOrRemoveName) {
			newDataMap[key] = this.dataMap[key];
		}
	}
	//add or update thiis child data
	if(addData !== undefined) {
		newDataMap[addOrRemoveName] = addData;
	}
	
	//make this immutable and set it as data for this folder
	Object.freeze(newDataMap);
	this.dataMap = newDataMap;
	this.setData(this.dataMap);
};

//============================
// Static methods
//============================

Folder.generator = {};
Folder.generator.displayName = "Folder";
Folder.generator.type = "apogee.Folder";
Folder.generator.createMember = Folder.fromJson;
Folder.generator.setDataOk = false;
Folder.generator.setCodeOk = false;

//register this member
Workspace.addMemberGenerator(Folder.generator);

/* 
 * This class manages the command history for undo/redo.
 * 
 * Commands that can be undone are stored in a circular queue with a length that is optionally 
 * settable at startup. (Otherwise a default len this used.)
 * 
 * Some rules for the undo/redo queue:
 * - only a max number of commands are stored
 * - when a command is undone or redone, the next undo and redo position is updated
 * - new commands are inserted replacing the next redo command (if there is one, otherwise they areput at the end)
 * - once the max number of commands are reached, additional added commands replace he oldeest command in the queue
 * 
 * The command manager fires an event each time the command history is updated.
 */
class CommandHistory {
    constructor(commandManager, eventManager, optionalUndoCommandCount) {
        this.commandManager = commandManager;
        this.eventManager = eventManager;
        this.undoCommandCount = (optionalUndoCommandCount !== undefined) ? optionalUndoCommandCount : CommandHistory.DEFAULT_UNDO_COMMAND_COUNT;
        this.clearHistory();
    }
    
    /** This method executes the given command and, if applicable, adds it to the queue. */
    addToHistory(undoCommand,redoCommand,description) {
        
        if((!undoCommand)||(!redoCommand)) {
            alert("Both the undo command and redo command must be provided");
            return;
        }
        
        var command = {};
        command.redoCmd = redoCommand;
        command.undoCmd = undoCommand;
        command.desc = description;
        
        this._saveCommand(command);

        //set workspace dirty whenever a command is added to history (description as argument thrown in gratuitiously, or now)
        this.eventManager.dispatchEvent("workspaceDirty",command.desc);
    }
    
    /** This method clears the undo/redo history. */
    clearHistory() {
        //set a fixed size array for our circular queue
        this.undoQueue = new Array(this.undoCommandCount);
        
        //we will keep cmd index values that DO NOT wrap.
        //we will assume we do not overflow the integers for now
        //to get an array index, we convert from cmd index to array index with a function using modulo
        
        //this where we will put the next added command
        this.nextInsertCmdIndex = 0;
        //this is last index that has a valid command, but only if it is greater than or equal to our first cmd index
        this.lastUsedCmdIndex = -1;
        //this is the first command index that has a valid command, but only if it is less than or equal to the last command index.
        this.firstUsedCmdIndex = 0;
        
        if(this.eventManager) {
            this.eventManager.dispatchEvent("historyUpdate",this);
        }
        
    }
    
    /** If there is an undo command, this method will return the description if there
     * is one or an empty string. If there is no undo command, this method will return
     * the value CommandHistory.NO_COMMAND. */
    getNextUndoDesc() {
        let command = this._getNextUndoCommand(false);
        if(command) {
            if(command.desc) {
                return command.desc
            }
            else {
                return "";
            }
        }
        else {
            return CommandHistory.NO_COMMAND;
        }
    }
    
    /** If there is an redo command, this method will return the description if there
     * is one or an empty string. If there is no undo command, this method will return
     * the value CommandHistory.NO_COMMAND. To test equality with
     * CommandHistory.NO_COMMAND, use == or ===. Do not test equality
     * with json equals!*/
    getNextRedoDesc() {
        let command = this._getNextRedoCommand(false);
        if(command) {
            if(command.desc) {
                return command.desc
            }
            else {
                return "";
            }
        }
        else {
            return CommandHistory.NO_COMMAND;
        }
    }
    
    /** This method undoes the next command to be undone. */
    undo() {
        let command = this._getNextUndoCommand(true);
        if((command)&&(command.undoCmd)) {
            let commandResult = this.commandManager.executeCommand(command.undoCmd,true);
            if(!commandResult.cmdDone) {
                this._commandUndoneFailed();
            }
        }
        else {
            //the ui should not let us get here
            alert("There is not command to undo");
        }  
    }
    
    /** This method redones the next command to be redone. */
    redo() {
        let command = this._getNextRedoCommand(true);
        if((command)&&(command.redoCmd)) {
            let commandResult = this.commandManager.executeCommand(command.redoCmd,true);
            if(!commandResult.cmdDone) {
                this.commandRedoneFailed();
            }
        }
        else {
            //the ui should not let us get here
            alert("There is not command to redo");
        }  
    }
    
    //=================================
    // Private Methods
    //=================================

    //-------------------------
    // These functions manage the undo queue
    //-------------------------
    
    _saveCommand(command) {
        let oldNextCmdIndex = this.nextInsertCmdIndex;
        let oldLastCmdIndex = this.lastUsedCmdIndex;
        let oldFirstCmdIndex = this.firstUsedCmdIndex;
        
        let insertArrayIndex = this._getArrayIndex(this.nextInsertCmdIndex);
        this.undoQueue[insertArrayIndex] = command;
        
        //update cmd index vlues
        // -last used index is the one just added
        this.lastUsedCmdIndex = this.nextInsertCmdIndex;
        // -next insert index is one more than the previous (wrapping is NOT done in the cmd index values, only in the array index values)
        this.nextInsertCmdIndex++;
        
        // -set the first used index
        if(oldFirstCmdIndex > oldLastCmdIndex) {
            //we need to set a valid value
            this.firstUsedCmdIndex == oldNextCmdIndex;
        }
        else {
            //check for wrapping commands
            let oldFirstArrayIndex = this._getArrayIndex(oldFirstCmdIndex);
            if(insertArrayIndex == oldFirstArrayIndex) {
                this.firstUsedCmdIndex++;
            }
        }
        
        //clear out any now unreachable redo commands
        if(this.nextInsertCmdIndex <= oldLastCmdIndex) {
            this._clearCommands(this.nextInsertCmdIndex,oldLastCmdIndex);
        }    
    }
    
    _getNextUndoCommand(doQueuePositionUpdate) {
        if((this.nextInsertCmdIndex - 1 >= this.firstUsedCmdIndex)&&(this.nextInsertCmdIndex - 1 <= this.lastUsedCmdIndex)) {
            let undoArrayIndex = this._getArrayIndex(this.nextInsertCmdIndex - 1);
            
            //update the queue positions, if requested
            if(doQueuePositionUpdate) {
                this.nextInsertCmdIndex--;
                
                //notify of change to command history
                if(this.eventManager) {
                    this.eventManager.dispatchEvent("historyUpdate",this);
                }
                
            }
            
            return this.undoQueue[undoArrayIndex];
        }
        else {
            //no available command
            return null;
        }
    }
    
    _getNextRedoCommand(doQueuePositionUpdate) {
        if((this.nextInsertCmdIndex >= this.firstUsedCmdIndex)&&(this.nextInsertCmdIndex <= this.lastUsedCmdIndex)) {
            let redoArrayIndex = this._getArrayIndex(this.nextInsertCmdIndex);
            
            //update the queue positions, if requested
            if(doQueuePositionUpdate) {
                this.nextInsertCmdIndex++;
                
                //notify of change to command history
                if(this.eventManager) {
                    this.eventManager.dispatchEvent("historyUpdate",this);
                }
            }
            
            return this.undoQueue[redoArrayIndex];
        }
        else {
            return null;
        }
    }
    
    _commandUndoneFailed() {
        //clear the undone command so it can not be redone (at the current position this.nextInsertCmdIndex)
        //and clear all commands previous to this one
        this._clearCommands(this.firstUsedCmdIndex,this.nextInsertCmdIndex);
        this.firstUsedCmdIndex = this.nextInsertCmdIndex;
        //we also need to update the last used index if it was the cmd we just failed to undo
        if(this.lastUsedCmdIndex === this.nextInsertCmdIndex) {
            this.lastUsedCmdIndex--;
        }
        
        //notify of change to command history
        if(this.eventManager) {
            this.eventManager.dispatchEvent("historyUpdate",this);
        }
    }
    
    _commandRedoneFailed() {
        //clear the redone command so it can not be undone (at the current position this.nextInsertCmdIndex-1)
        //and clear all commands after to this one
        this._clearCommands(this.nextInsertCmdIndex-1,this.lastUsedCmdIndex);
        this.lastUsedCmdIndex = this.nextInsertCmdIndex-1;
        //we also need to update the first used index if it was the cmd we just failed to redo
        if(this.firstUsedCmdIndex === this.nextInsertCmdIndex-1) {
            this.firstUsedCmdIndex++;
        }
        
        //notify of change to command history
        if(this.eventManager) {
            this.eventManager.dispatchEvent("historyUpdate",this);
        }
    }
    
    _getArrayIndex(cmdIndex) {
        return cmdIndex % this.undoCommandCount;
    }
    
    _clearCommands(startCmdIndex,endCmdIndex) {
        for(var cmdIndex = startCmdIndex; cmdIndex <= endCmdIndex; cmdIndex++) {
            let arrayIndex = this._getArrayIndex(cmdIndex);
            this.undoQueue[arrayIndex] = undefined;
        }
    }
}

/** This is a token to represent there is no command available, either for 
 * undo or redo. */
CommandHistory.NO_COMMAND = {};

/** This is the default number of stored undo/redo commands */
CommandHistory.DEFAULT_UNDO_COMMAND_COUNT = 50;

/* 
 * This class manages executing commands and storign and operating the command history for undo/redo.
 * It provides standarde error handling for the commands in addition to managing undo/redo or commands.
 * 
 * Command Structure:
 * {
 *      type - This is a string giving the command type. This will be used to dispatch
 *      the command to the proper execution function. The string should correspond to 
 *      a command that was registered with the regiter command function.  
 *     
 *     ?: setsDirty?
 *     
 *     ?: noUndo?
 *     
 *     (everything else depends on the specific command)
 * }
 * 
 * Command Object - Should be registered with "registerFunction". It should contain the following things:
 * - function executeCommand(workspaceUI,commandData) = This exectues the command and return a commandResult object.
 * - function createUnfoCommand(workspceUI,commandData) - This creates an undo command json from the given command json.
 * - string COMMAND_TYPE - This is the command type.
 *  
 * Command Result:
 * After executing a command, a commandResult is returned:
 * {
 *      cmdDone: If this is true the command was done. This implies the undo command
 *      should undo the results. If this value is false, no action was taken.
 *
 *      alertMsg - This is a message for the user after the command was executed. This
 *      is typically an error mesasge. There may still be a message if cmdDone is true, 
 *      since that does not necessarily imply the command was exectued completely
 *      as intended.
 *      
 *      isFatal - If this flag is set there was an error that may have left the 
 *      program in an inoperable or unpredictably state and the program should be
 *      aborted. 
 *      
 *      (all other data depends on the specific command)
 *
 */
class CommandManager {
    constructor(app,eventManager) {
        this.app = app;
        this.eventManager = eventManager;

        this.commandHistory = new CommandHistory(this,eventManager);
    }
    
    /** This method executes the given command and, if applicable, adds it to the queue. 
     * Supress history is a temp addition for testing.
    */
    executeCommand(command,suppressFromHistory) {
        var workspaceUI = this.app.getWorkspaceUI();
        let commandResult;
        
        var commandObject = CommandManager.getCommandObject(command.type);

        //FOR NOW? - MAKE UNDO COMMAND BEFORE EXECUTING COMMAND, IF WE NEED IT (because it is sometimes made by reading the current state)
        let undoCommand;
        let description;
        if((!suppressFromHistory)&&(commandObject.createUndoCommand)) {   
            undoCommand = commandObject.createUndoCommand(workspaceUI,command);  
            description = commandObject.COMMAND_TYPE; //need a better description
        }

        if(commandObject) {
            try {
                commandResult = commandObject.executeCommand(workspaceUI,command);
            }
            catch(error) {
                if(error.stack) console.error(error.stack);
                
                commandResult = {};
                commandResult.cmdDone = false;
                commandResult.alertMsg = "Unknown error executing command: " + error.message;
                commandResult.isFatal = true;
                
            }
        }
        else {
            commandResult = {};
            commandResult.cmdDone = false;
            commandResult.alertMsg = "Command type not found: " + command.type;
        }
        
        //history??
        //this is temporary code
        if((commandResult.cmdDone)&&(undoCommand)) {   
            this.commandHistory.addToHistory(undoCommand,command,description);
        }
        
        //fire events!!
        
        //display? Including for fatal errors?
        
        if(commandResult.alertMsg) CommandManager.errorAlert(commandResult.alertMsg,commandResult.isFatal);
        
        return commandResult;
    }

    /** This returns the command history. */
    getCommandHistory() {
        return this.commandHistory;
    }
    
    /** This message does a standard error alert for the user. If the error is
     * fatal, meaning the application is not in a stable state, the flag isFatal
     * should be set to true. Otherwise it can be omitted or set to false.  */
    static errorAlert(errorMsg,isFatal) {
        if(isFatal) {
            errorMsg = "Fatal Error: The application is in an indterminate state and should be closed!. " + errorMsg;
        }
        
        alert(errorMsg);
    }
    
    /** This registers a command. The command object should hold two functions,
     * executeCommand(workspaceUI,commandData) and, if applicable, createUndoCommand(workspaceUI,commandData)
     * and it should have the constant COMMAND_TYPE.
     */
    static registerCommand(commandObject) {
        
        //repeat warning
        let existingCommandObject = CommandManager.commandMap[commandObject.COMMAND_TYPE];
        if(existingCommandObject) {
            alert("The given command already exists in the command manager: " + commandObject.COMMAND_TYPE + ". It will be replaced with the new command");
        }
        
        CommandManager.commandMap[commandObject.COMMAND_TYPE] = commandObject;
    }
    
    static getCommandObject(commandType) {
        return CommandManager.commandMap[commandType];
    }
    
}

/** This is a map of commands accessibly to the command manager. */
CommandManager.commandMap = {};

/** This is a folderFunction, which is basically a function
 * that is expanded into data objects. */
function FolderFunction(name,owner,initialData) {
    //base init
    Member.init.call(this,name,FolderFunction.generator);
    Dependent$1.init.call(this);
    ContextHolder.init.call(this);
    Owner.init.call(this);
    RootHolder.init.call(this);
    
    this.initOwner(owner);
    
    //set initial data
    this.argList = initialData.argList !== undefined ? initialData.argList : [];
    this.returnValueString = initialData.returnValue !== undefined ? initialData.returnValue : [];
    //set to an empty function
    this.setData(function(){});
    this.fieldUpdated("argList");
    this.fieldUpdated("returnValue");
}

//add components to this class
base$1.mixin(FolderFunction,Member);
base$1.mixin(FolderFunction,Dependent$1);
base$1.mixin(FolderFunction,ContextHolder);
base$1.mixin(FolderFunction,Owner);
base$1.mixin(FolderFunction,RootHolder);

FolderFunction.INTERNAL_FOLDER_NAME = "root";

/** This gets the internal forlder for the folderFunction. */
FolderFunction.prototype.getInternalFolder = function() {
    return this.internalFolder;
};

/** Implemnetation of get root for folder function. */
FolderFunction.prototype.getRoot = function() {
    return this.getInternalFolder();
};

/** This method sets the root object - implemented from RootHolder.  */
FolderFunction.prototype.setRoot = function(child) {
    this.internalFolder = child;
    var newDependsOn = [];
    if(child) newDependsOn.push(child);
    this.updateDependencies(newDependsOn);
};

/** This gets the name of the return object for the folderFunction function. */
FolderFunction.prototype.getReturnValueString = function() {
    return this.returnValueString;
};

/** This gets the arg list of the folderFunction function. */
FolderFunction.prototype.getArgList = function() {
    return this.argList;
};

//------------------------------
// Member Methods
//------------------------------

/** This method removes any data from this workspace on closing. */
FolderFunction.prototype.close = function() {
    this.internalFolder.onClose();
};

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
FolderFunction.fromJson = function(owner,json) {
    return new FolderFunction(json.name,owner,json.updateData);
};

/** This method adds any additional data to the json saved for this member. 
 * @protected */
FolderFunction.prototype.addToJson = function(json) {
    json.updateData = {};
    json.updateData.argList = this.argList;
    json.updateData.returnValue = this.returnValueString;
    json.children = {};
    json.children[FolderFunction.INTERNAL_FOLDER_NAME] = this.internalFolder.toJson();
};

/** This method extends the base method to get the property values
 * for the property editting. */
FolderFunction.readProperties = function(member,values) {
    var argList = member.getArgList();
    var argListString = argList.toString();
    values.argListString = argListString;
    values.returnValueString = member.getReturnValueString();
    return values;
};

/** This method executes a property update. */
FolderFunction.getPropertyUpdateAction = function(folderFunction,newValues) {
    let updateData = newValues.updateData;
    if((updateData)&&((updateData.argList !== undefined)||(updateData.returnValue !== undefined))) {

        var argList = updateData.argList ? updateData.argList : folderFunction.argList;
        var returnValueString = updateData.returnValue ? updateData.returnValue : folderFunction.returnValueString;
 
        var actionData = {};
        actionData.action = "updateFolderFunction";
        actionData.memberName = folderFunction.getFullName();
        actionData.argList = argList;
        actionData.returnValueString = returnValueString;
        return actionData;
    }    
    else {
        return null;
    }
};

//-------------------------------
// Dependent Methods
//-------------------------------
    

/** If this is true the member must be executed. */
FolderFunction.prototype.needsCalculating = function() {
	return true;
};

/** This updates the member data based on the function. It returns
 * true for success and false if there is an error.  */
FolderFunction.prototype.calculate = function() {  
    //make sure the data is set in each impactor
    this.initializeImpactors();
    
    var folderFunctionErrors = [];
    
	//check for code errors, if so set a data error
    var folderFunctionFunction = this.getFolderFunctionFunction(folderFunctionErrors);
    
    if(folderFunctionErrors.length == 0) {
        this.setData(folderFunctionFunction);
    }
    else {
        //for now I can only set a single error. I will set the first.
        //I should get way to set multiple
        this.addErrors(folderFunctionErrors);
    }
    
    this.clearCalcPending();
};

/** This method updates the dependencies of any children
 * based on an object being added. */
FolderFunction.prototype.updateDependeciesForModelChange = function(recalculateList) {
    if(this.internalFolder) {
        this.internalFolder.updateDependeciesForModelChange(recalculateList);
    }
};

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
FolderFunction.prototype.createContextManager = function() {
    return new ContextManager(this);
};

//------------------------------
//Parent methods
//------------------------------

/** this method gets the table map. */
FolderFunction.prototype.getChildMap = function() {
    return this.internalFolder.childMap;
};

/** This method looks up a child from this folder.  */
FolderFunction.prototype.lookupChild = function(name) {
    //check look for object in this folder
    return this.internalFolder.childMap[name];
};

//------------------------------
//Owner methods
//------------------------------

/** this method gets the hame the children inherit for the full name. */
FolderFunction.prototype.getPossesionNameBase = function() {
    return this.getFullName() + ".";
};

/** This method looks up a member by its full name. */
FolderFunction.prototype.getMemberByPathArray = function(path,startElement) {
    if(startElement === undefined) startElement = 0;
    if(path[startElement] === this.internalFolder.getName()) {
        if(startElement === path.length-1) {
            return this.internalFolder;
        }
        else {
            startElement++;
            return this.internalFolder.lookupChildFromPathArray(path,startElement);
        }
    }
    else {
        return null;
    }
};


//==============================
// Private Methods
//==============================

/** This is called from the update action. It should not be called externally. */
FolderFunction.prototype.setReturnValueString = function(returnValueString) {
    if(this.returnValueString != returnValueString) {
        this.fieldUpdated("returnValue");
    }
    this.returnValueString = returnValueString;
};

/** This is called from the update action. It should not be called externally. */
FolderFunction.prototype.setArgList = function(argList) {
    if(this.argList != argList) {
        this.fieldUpdated("argList");
    }
    this.argList = argList;
};

/** This method creates the folderFunction function. It is called from the update action 
 * and should not be called externally. 
 * @private */
FolderFunction.prototype.getFolderFunctionFunction = function(folderFunctionErrors) {

    //create a copy of the workspace to do the function calculation - we don't update the UI display version
    var virtualWorkspace;
    var rootFolder;
    var inputElementArray;
    var returnValueTable; 
    
    var initialized = false;
    var instance = this;
    
    var folderFunctionFunction = function(args) {
        
        if(!initialized) {
            //create a copy of the workspace to do the function calculation - we don't update the UI display version
            virtualWorkspace = instance.createVirtualWorkspace(folderFunctionErrors);
	
    //HANDLE THIS ERROR CASE DIFFERENTLY!!!
            if(!virtualWorkspace) {
                return null;
            }

            //lookup elements from virtual workspace
            rootFolder = virtualWorkspace.getRoot();
            inputElementArray = instance.loadInputElements(rootFolder,folderFunctionErrors);
            returnValueTable = instance.loadOutputElement(rootFolder,folderFunctionErrors); 
            
            initialized = true;
        }
        
        //create an update array to set the table values to the elements  
        var updateActionList = [];
        for(var i = 0; i < inputElementArray.length; i++) {
            var entry = {};
            entry.action = "updateData";
            entry.memberName = inputElementArray[i].getFullName();
            entry.data = arguments[i];
            updateActionList.push(entry);
        }
        
        var actionData = {};
        actionData.action = "compoundAction";
        actionData.actions = updateActionList;

        //apply the update
        var actionResult = doAction(virtualWorkspace,actionData);        
        if(actionResult.alertMsg) {
            CommandManager.errorAlert(actionResult.alertMsg);
        }
        if(actionResult.actionDone) {
            //retrieve the result
            if(returnValueTable) {
                
                if(returnValueTable.getResultPending()) {
                    throw new Error("A folder function must not be asynchronous: " + instance.getFullName());
                }
                
                return returnValueTable.getData();
            }
            else {
                //no return value found
                return undefined;
            }
        }
    };
    
    return folderFunctionFunction;    
};

/** This method creates a copy of the workspace to be used for the function evvaluation. 
 * @private */
FolderFunction.prototype.createVirtualWorkspace = function(folderFunctionErrors) {
    try {
        var folderJson = this.internalFolder.toJson();
		var workspaceJson = Workspace.createWorkpaceJsonFromFolderJson(this.getName(),folderJson);
        var virtualWorkspace = new Workspace(this.getOwner());
        var actionResult = virtualWorkspace.loadFromJson(workspaceJson);
        
        //do something with action result!!!
        
        return virtualWorkspace;
	}
	catch(error) {
        var actionError = ActionError.processException(error,"FolderFunction - Code",false);
		folderFunctionErrors.push(actionError);
		return null;
	}
};

/** This method loads the input argument members from the virtual workspace. 
 * @private */
FolderFunction.prototype.loadInputElements = function(rootFolder,folderFunctionErrors) {
    var argMembers = [];
    for(var i = 0; i < this.argList.length; i++) {
        var argName = this.argList[i];
        var argMember = rootFolder.lookupChild(argName);
        if(argMember) {
			argMembers.push(argMember);
		}
//		else {
//            //missing input element
//            var msg = "Input element not found in folderFunction: " + argName;
//            var actionError = new ActionError(msg,"FolderFunction - Code",this);
//            folderFunctionErrors.push(actionError);
//        }       
    }
    return argMembers;
};

/** This method loads the output member from the virtual workspace. 
 * @private  */
FolderFunction.prototype.loadOutputElement = function(rootFolder,folderFunctionErrors) {
    var returnValueMember = rootFolder.lookupChild(this.returnValueString);
//    if(!returnValueMember) {
//        //missing input element
//        var msg = "Return element not found in folderFunction: " + this.returnValueString;
//        var actionError = new ActionError(msg,"FolderFunction - Code",this);
//        folderFunctionErrors.push(actionError);
//    }
    return returnValueMember;
};

        
//============================
// Static methods
//============================

FolderFunction.generator = {};
FolderFunction.generator.displayName = "Folder Function";
FolderFunction.generator.type = "apogee.FolderFunction";
FolderFunction.generator.createMember = FolderFunction.fromJson;
FolderFunction.generator.readProperties = FolderFunction.readProperties;
FolderFunction.generator.getPropertyUpdateAction = FolderFunction.getPropertyUpdateAction;
FolderFunction.generator.setDataOk = false;
FolderFunction.generator.setCodeOk = false;

//register this member
Workspace.addMemberGenerator(FolderFunction.generator);

/** This class encapsulatees a table with no specific functionality. It
 * is intended to be used as a placeholder when a table generator is not found. */
function ErrorTable(name,owner,completeJson) {
    //base init
    Member.init.call(this,name,ErrorTable.generator);
    //i didn't really want this to be a dependent, bot for now I think they all have to be - check into this.
    //there are at least two places
    //- add to recalc list function in action (which I temporarily fixed)
    //- initialize impactors in dependent, assumes all impactors are dependents (this is also needed 
    Dependent.init.call(this);
    
    this.initOwner(owner);
    
    //store this to use during save later
    this.completeJson = completeJson;
    this.fieldUpdated("completeJson");

    var dummyData = "";
    this.setData(dummyData);
}

//add components to this class
base$1.mixin(ErrorTable,Member);
//base.mixin(ErrorTable,Dependent);

//------------------------------
// Member Methods
//------------------------------

/** This method extends set data from member. It also
 * freezes the object so it is immutable. (in the future we may
 * consider copying instead, or allowing a choice)*/
ErrorTable.prototype.setData = function(data) {
    
	//make this object immutable
	base$1.deepFreeze(data);

	//store the new object
    return Member.setData.call(this,data);
};

/** This overrides the commplete json to just pass back the entire json sent in. */
ErrorTable.prototype.toJson = function() {
    return this.completeJson;
};

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
ErrorTable.fromJson = function(owner,json) {
    //note - we send in the complete JSON so we can return is on saving
    return new ErrorTable(json.name,owner,json);
};

//------------------------------
// Dependent Methods
//------------------------------

/** This method udpates the dependencies if needed because
 *a variable was added or removed from the workspace.  */
ErrorTable.prototype.updateDependeciesForModelChange = function(object) {
    //no action
};

/** This is a check to see if the object should be checked for dependencies 
 * for recalculation. It is safe for this method to always return false and
 allow the calculation to happen. 
 * @private */
ErrorTable.prototype.needsCalculating = function() {
    return false;
};

/** This method udpates the dependencies if needed because
 *the passed variable was added.  */
ErrorTable.prototype.updateDependeciesForModelChange = function(recalculateList) {
    //no action
};
//============================
// Static methods
//============================

ErrorTable.generator = {};
ErrorTable.generator.displayName = "Table";
ErrorTable.generator.type = "apogee.ErrorTable";
ErrorTable.generator.createMember = ErrorTable.fromJson;
ErrorTable.generator.setDataOk = false;

//register this member
Workspace.addMemberGenerator(ErrorTable.generator);

//These are self installing table types. They have no exports. */

/** These functions assist in using adebugger. */

/** The function is called when a member function is called. It
 * is intended for debug purposes, to add a breakpoint. */
__globals__.__memberFunctionDebugHook = function(memberFullName) {
};

/** This function is called from the constructor code for a custom control.
 * It is intended to allow adding a breakpoint before entering user code.
 * To use this, the constuctor must be set. */
__globals__.__customControlDebugHook = function(args) {
};

/** This is a wrapper used in function table creation to help make 
 * debugging more readable, rather than placing this code in the section that
 * is obfuscated. */
__globals__.__functionTableWrapper = function(initMember) {

    var memberFunction;
    var memberInitialized = false;

    //create member function for lazy initialization
    var wrapperMemberFunction = function(argList) {
        if(!memberInitialized) {
            memberFunction = initMember();
            memberInitialized = true;
        }

        return memberFunction.apply(null,arguments);
    };
    
    return wrapperMemberFunction;
};

exports.Workspace = Workspace;
exports.doAction = doAction;
