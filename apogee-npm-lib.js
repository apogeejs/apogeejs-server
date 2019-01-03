/* Apogee NPM Lib Version 0.8.8 */

//============================================
var esprima = require('esprima');

//=============================================

__globals__ = global;


;
/** Main project name space */
apogee = {};

;
/** This namespace contains some basic functions for the application. */
apogee.base = {};

apogee.base.MEMBER_FUNCTION_INVALID_THROWABLE = {"apogeeException":"invalid"};
apogee.base.MEMBER_FUNCTION_PENDING_THROWABLE = {"apogeeException":"pending"};

/** This method creates an integer has value for a string. */
apogee.base.mixin = function(destObject,mixinObject) {
    for(var key in mixinObject) {
        destObject.prototype[key] = mixinObject[key];
    }
}

/** This method creates an integer has value for a string. */
apogee.base.isPromise = function(object) {
    if(object === null) return false;
    return (typeof object === "object")&&(object.constructor === Promise);
}

/** This method takes a field which can be an object, 
 *array or other value. If it is an object or array it 
 *freezes that object and all of its children, recursively.
 * Warning - this does not check for cycles (which are not in JSON 
 * objects but can be in javascript objects)
 * Implementation from Mozilla */
apogee.base.deepFreeze = function(obj) {
    if((obj === null)||(obj === undefined)) return;
    
    //retrieve the property names defined on obj
    var propNames = Object.getOwnPropertyNames(obj);

    //freeze properties before freezing self
    propNames.forEach(function(name) {
        var prop = obj[name];

        //freeze prop if it is an object
        if(typeof prop == 'object' && prop !== null) apogee.base.deepFreeze(prop);
    });

    //freeze self (no-op if already frozen)
    return Object.freeze(obj);
}

/** This method creates an error object, which has a "message" in the format
 *of a system error. The isFatal flag can be set to specify if this is a fatal or nonfatal
 *error. It may also be omitted. A base error may also be set. */
apogee.base.createError = function(msg,optionalIsFatal,optionalBaseError) {
    var error = new Error(msg);
	if(optionalIsFatal !== undefined) {
		error.isFatal = optionalIsFatal;
	}
	if(optionalBaseError !== undefined) {
		error.baseError = optionalBaseError;
	}
    return error;
}

/** This creates a new array with elements from the first that are not in the second. 
 * I wasn't really sure where to put this. So it ended up here. */
apogee.base.getListInFirstButNotSecond = function(firstList,secondList) {
    var newList = [];
    for(var i = 0; i < firstList.length; i++) {
        var entry = firstList[i];
        if(secondList.indexOf(entry) < 0) {
            newList.push(entry);
        }
    }
    return newList;
};
/** This namespace includes some utility function available to the user. They 
 * are also used in the applictaion. */
apogee.util = {};

/** This value can be assigned to a data table to signify that data is not valid.
 * Any other member depending on this value will withhold the calcalation and also
 * return this invalid value. */
apogee.util.INVALID_VALUE = {"apogeeValue":"INVALID VALUE"};

/** This function should be called from the body of a function table
 * to indicate the function will not return a valid value. (The actual invalid value
 * can not be returned since this typically will not have the desired effect.)
 */
apogee.util.invalidFunctionReturn = function() {
    throw apogee.base.MEMBER_FUNCTION_INVALID_THROWABLE;
}

/** This method creates an integer has value for a string. */
apogee.util.stringHash = function(string) {
    var HASH_SIZE = 0xffffffff;
    var hash = 0;
    var ch;
    for (var i = 0; i < string.length; i++) {
        ch = string.charCodeAt(i);
        hash = (31 * hash + ch) & HASH_SIZE;
    }
    return hash;
}

/** This method creates an integer hash value for an object. */
apogee.util.objectHash = function(object) {
    //this is not real efficient. It should be implemented differently
    var string = JSON.stringify(object);
    return stringHash(string);
}

apogee.util.constructors = {
    "String": ("").constructor,
    "Number": (3).constructor,
    "Boolean": (true).constructor,
    "Date": (new Date()).constructor,
    "Object": ({}).constructor,
    "Array": ([]).constructor,
    "Function": (function(){}).constructor
}

/** This method returns the object type. The Allowed types are:
 * String, Number, Boolean, Date, Object, Array, Function, null, undefined. */
apogee.util.getObjectType = function(object) {
    if(object === null) return "null";
    if(object === undefined) return "undefined";
    
    var constructor = object.constructor;
    for(var key in apogee.util.constructors) {
        if(constructor == apogee.util.constructors[key]) {
            return key;
        }	
    }
    //not found
    return "Unknown";
}

/** This method creates a deep copy of an object, array or value. Note that
 * undefined is not a valid value in JSON. */
apogee.util.jsonCopy = function(data) {
    if(data === null) return null;
    if(data === undefined) return undefined;
    return JSON.parse(JSON.stringify(data));
}

/** This method does format string functionality. Text should include
 * {i} to insert the ith string argument passed. */
apogee.util.formatString = function(format,stringArgs) {
    var formatParams = arguments;
    return format.replace(/{(\d+)}/g, function(match,p1) {
        var index = Number(p1) + 1;
        return formatParams[index]; 
    });
};

/** This method reads the query string from a url */
apogee.util.readQueryField = function(field,url) {
    var href = url ? url : window.location.href;
    var reg = new RegExp( '[?&]' + field + '=([^&#]*)', 'i' );
    var string = reg.exec(href);
    return string ? string[1] : null;
}

/** This is a not-so-efficient equals for json objects. */
apogee.util.jsonEquals = function(json1,json2) {
    var string1 = JSON.stringify(apogee.util.getNormalizedCopy(json1));
    var string2 = JSON.stringify(apogee.util.getNormalizedCopy(json2));
    return (string1 == string2);
}

/** This method returns a copied json that has the order in all object normalized to alphabetical. 
 * This is intended for the purpose of comparing json objects. */
apogee.util.getNormalizedCopy = function(json) {
    var copiedJson;

    var objectType = apogee.util.getObjectType(json);
    
    switch(objectType) {
        case "Object":
            copiedJson = apogee.util.getNormalizedObjectCopy(json);
            break;
            
        case "Array": 
            copiedJson = apogee.util.getNormalizedArrayCopy(json);
            break;
            
        default:
            copiedJson = json;
    }
    
    return copiedJson;
}

/** this orders the keys apphabetically, since order is not important in a json object */
apogee.util.getNormalizedObjectCopy = function(json) {
    var copiedJson = {};
    
    var keys = [];
    var key;
    for(key in json) {
        keys.push(key);
    }
    
    keys.sort();
    
    for(var i = 0; i < keys.length; i++) {
        key = keys[i];
        copiedJson[key] = apogee.util.getNormalizedCopy(json[key]);
    }
    return copiedJson;
}

/** This makes a copy of with any contained objects normalized. */
apogee.util.getNormalizedArrayCopy = function(json) {
    var copiedJson = [];
    for(var i = 0; i < json.length; i++) {
        var element = json[i];
        copiedJson.push(apogee.util.getNormalizedCopy(element));
    }
    return copiedJson;
};
/** This namespace includes network request functions. */
apogee.net = {};

/** This method creates an integer has value for a string. 
 * options:
 * "method" - HTTP method, default value is "GET"
 * "body" - HTTP body
 * "header" - HTTP headers, example: {"Content-Type":"text/plain","other-header":"xxx"}
 */
apogee.net.callbackRequest = function(url,onSuccess,onError,options) {
    
    var xmlhttp=new XMLHttpRequest();

    xmlhttp.onreadystatechange=function() {
        var msg;
        if(xmlhttp.readyState==4) {
            if(xmlhttp.status==200) {
                try {
                    onSuccess(xmlhttp.responseText);
                }
                catch(error) {
                    onError(error.message);
                }

            }
            else if(xmlhttp.status >= 400)  {
                msg = "Error in http request. Status: " + xmlhttp.status;
                onError(msg);
            }
            else if(xmlhttp.status == 0) {
                msg = "Preflight error in request. See console";
                onError(msg);
            }
        }
    }

    if(!options) options = {};
    
    var method = options.method ? options.method : "GET";
    xmlhttp.open(method,url,true);
    
    if(options.header) {
        for(var key in options.header) {
            xmlhttp.setRequestHeader(key,options.header[key]);
        }
    }
    
    xmlhttp.send(options.body);
}

/** This method creates an integer has value for a string. 
 * See apogee.net.callbackRequest for a list of options. */
apogee.net.textRequest = function(url,options) {
    return new Promise(function(onSuccess,onError) {
        apogee.net.callbackRequest(url,onSuccess,onError,options);
    });
}

/** This method creates an integer has value for a string.
 * See apogee.net.callbackRequest for a list of options. */
apogee.net.jsonRequest = function(url,options) {
    return apogee.net.textRequest(url,options).then(JSON.parse);
}
;
/* 
 * This is a mixin to give event functionality.
 */
apogee.EventManager = {};
    
/** This serves as the constructor. */
apogee.EventManager.init = function() {
     /** This field holds the event listeners
    * @private */
    this.listenerTable = {};
    
    /** This field holds the event handlers
    * @private */
    this.handlerTable = {};
}

/** This method adds a listener for the given event. */
apogee.EventManager.addListener = function(eventName, callback) {
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
}

/** This method removes a listener for the event. */
apogee.EventManager.removeListener = function(eventName, callback) {
    var callbackList = this.listenerTable[eventName];
    if(callbackList) {
        var index = callbackList.indexOf(callback);
        if(index >= 0) {
            callbackList.splice(index,1);
        }
    }
}

/** THis method dispatches an event. */
apogee.EventManager.dispatchEvent = function(eventName, eventData) {
    var callbackList = this.listenerTable[eventName];
    if(callbackList) {
        for(var i = 0; i < callbackList.length; i++) {
            var callback = callbackList[i];
            callback.call(null,eventData);
        }
    }
}


/** This method adds a handler. */
apogee.EventManager.addHandler = function(handlerName, callback) {
    this.handlerTable[handlerName] = callback;
}

/** This method clears a handler. */
apogee.EventManager.removeHandler = function(handlerName) {
    delete this.handlerTable[handlerName];
}

/** This method calls a handler by name and returns the result. If no 
 * handler is found undefined is returned. */
apogee.EventManager.callHandler = function(handlerName, handlerData) {
    var callback = this.handlerTable[handlerName];
    if(callback) {
        return callback(handlerData)
    }
    else {
        return undefined;
    }
}

;

    
/** This class manages context for the user code. This is used to associate names
 *from the user code with objects from the workspace. The argument passed here is
 *the object assoicatd with the context manager. */
apogee.ContextManager = function(contextHolder) {
    this.contextHolder = contextHolder;
    this.contextList = [];
}

apogee.ContextManager.prototype.addToContextList = function(entry) {
    this.contextList.push(entry);
}

apogee.ContextManager.prototype.removeFromContextList = function(entry) {
    var index = this.contextList.indexOf(entry);
    if(index >= 0) {
        this.contextList.splice(index,1);
    }
}

apogee.ContextManager.prototype.clearContextList = function() {
    this.contextList = [];
}

apogee.ContextManager.prototype.getBaseData = function(baseName) {
    return this.hierarchicalLookup("lookupData",baseName);
}

apogee.ContextManager.prototype.getImpactor = function(path) {
    return this.hierarchicalLookup("lookupImpactor",path);
}

//==================================
// Private Methods
//==================================

apogee.ContextManager.prototype.hierarchicalLookup = function(lookupFunctionName,lookupKey) {

    //lookup base name in the context list
    var result = this.lookup(lookupFunctionName,lookupKey);
    
    if(result !== undefined) {
        return result;
    }
    else if((this.contextHolder)&&(this.contextHolder.getOwner)) {
        var owner = this.contextHolder.getOwner();
        if(owner) {
            var ownerContextManager = owner.getContextManager();
            return ownerContextManager.hierarchicalLookup(lookupFunctionName,lookupKey);
        }
    }
    
    return undefined;
}

apogee.ContextManager.prototype.lookup = function(lookupFunctionName,lookupKey) {
	//cycle through the variables used
	for(var i = 0; i < this.contextList.length; i++) {
        var entry = this.contextList[i];
        var result = this[lookupFunctionName](entry,lookupKey); 
        if(result !== undefined) {
            return result;
        }
    }
    //not found
    return undefined;
}

apogee.ContextManager.prototype.lookupData = function(entry,baseName) {   
    if(entry.parent) {
        var child = entry.parent.lookupChild(baseName);
        if(child) {
            return child.getData();
        }
        else {
            return undefined;
        }
    }
    else if(entry.data) {
        return entry.data[baseName];
    }
}

apogee.ContextManager.prototype.lookupImpactor = function(entry,path) {
    if(entry.parent) {
        return entry.parent.lookupChildFromPathArray(path);
    }
    else {
        return undefined;
    }
}



;
  
apogee.codeCompiler = {};

/** @private */
apogee.codeCompiler.APOGEE_FORBIDDEN_NAMES = {
    "apogeeMessenger": true,
    "__initializer": true,
    "__memberFunction": true,
    "__memberGenerator": true,
    "__memberFunctionDebugHook": true
}

/** @private */
apogee.codeCompiler.NAME_PATTERN = /[a-zA-Z_$][0-9a-zA-Z_$]*/;

/** This function validates a table name. It returns 
 * [valid,errorMsg]. */
apogee.codeCompiler.validateTableName = function(name) {
    var nameResult = {};

    //check if it is a keyword
    if(apogee.codeAnalysis.KEYWORDS[name]) {
        nameResult.errorMessage = "Illegal name: " + name + " - Javascript reserved keyword";
        nameResult.valid = false;
    }  
    else if(apogee.codeAnalysis.EXCLUSION_NAMES[name]) {
        nameResult.errorMessage = "Illegal name: " + name + " - Javascript variable or value name";
        nameResult.valid = false;
    }
    else if(apogee.codeCompiler.APOGEE_FORBIDDEN_NAMES[name]) {
        nameResult.errorMessage = "Illegal name: " + name + " - Apogee reserved keyword";
        nameResult.valid = false;
    }
    else {
        //check the pattern
        var nameResult = apogee.codeCompiler.NAME_PATTERN.exec(name);
        if((!nameResult)||(nameResult[0] !== name)) {
            nameResult.errorMessage = "Illegal name format: " + name;
            nameResult.valid = false;
        }
        else {
            nameResult.valid = true;
        }
    }
    return nameResult;
}

/** This method analyzes the code and creates the object function and dependencies. 
 * The results are loaded into the passed object processedCodeData. */
apogee.codeCompiler.processCode = function(codeInfo,codeLabel) {
    
    //analyze the code
    var combinedFunctionBody = apogee.codeCompiler.createCombinedFunctionBody(
        codeInfo.argList, 
        codeInfo.functionBody, 
        codeInfo.supplementalCode, 
        codeLabel);
        
    //get the accessed variables
    //
    //parse the code and get variable dependencies
    var effectiveCombinedFunctionBody = apogee.codeCompiler.MEMBER_LOCALS_TEXT + combinedFunctionBody;
    var analyzeOutput = apogee.codeAnalysis.analyzeCode(effectiveCombinedFunctionBody);
    
    var compiledInfo = {};
    
    if(analyzeOutput.success) {
        compiledInfo.varInfo = analyzeOutput.varInfo;
    }
    else {
        compiledInfo.errors = analyzeOutput.errors;
        return compiledInfo;
    }

    //create the object function and context setter from the code text
    var generatorFunction = apogee.codeCompiler.createGeneratorFunction(compiledInfo.varInfo, combinedFunctionBody);
    compiledInfo.generatorFunction = generatorFunction;
    
    return compiledInfo;   
}


/** This method creates the user code object function body. 
 * @private */
apogee.codeCompiler.createCombinedFunctionBody = function(argList,
        functionBody, 
        supplementalCode,
        codeLabel) {
    
    var argListString = argList.join(",");
    
    //create the code body
    var combinedFunctionBody = apogee.util.formatString(
        apogee.codeCompiler.MEMBER_FUNCTION_FORMAT_TEXT,
		codeLabel,
        argListString,
        functionBody,
        supplementalCode
    );
        
    return combinedFunctionBody;
}

/** This method creates the wrapped user code object function, including the context variables. 
 * @private */
apogee.codeCompiler.createGeneratorFunction = function(varInfo, combinedFunctionBody) {
    
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
        initializerBody += baseName + ' = contextManager.getBaseData("' + baseName + '");\n';
    }
    
    //create the generator for the object function
    var generatorBody = apogee.util.formatString(
        apogee.codeCompiler.GENERATOR_FUNCTION_FORMAT_TEXT,
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
apogee.codeCompiler.MEMBER_FUNCTION_FORMAT_TEXT = [
"//{0}",
"",
"//supplemental code--------------",
"{3}",
"//end supplemental code----------",
"",
"//member function----------------",
"function __memberFunction({1}) {",
"//overhead code",
"__memberFunctionDebugHook();",
"",
"//user code",
"{2}",
"};",
"//end member function------------",
   ].join("\n");
   
/** This line is added when getting the dependencies to account for some local 
 * variables in the member function.
 * @private */
apogee.codeCompiler.MEMBER_LOCALS_TEXT = "var apogeeMessenger, __memberFunction, __memberFunctionDebugHook;";
   
/** This is the format string to create the code body for the object function
 * Input indices:
 * 0: context declaration text
 * 1: context setter body
 * 2: object function body
 * @private
 */
apogee.codeCompiler.GENERATOR_FUNCTION_FORMAT_TEXT = [
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



;
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

apogee.codeAnalysis = {};

/** Syntax for AST, names from Esprima.
 * Each entry is a list of nodes inside a node of a given type. the list
 * contains entries with the given fields:
 * {
 *     name:[the name of the field in the node]
 *     list:[true if the field is a list of nodes]
 *     declaration:[boolean indicating if the field corrsponds to a field declaration]
 * @private */
apogee.codeAnalysis.syntax = {
    AssignmentExpression: [{name:'left'},{name:'right'}],
    ArrayExpression: [{name:'elements',list:true}],
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
    SequenceExpression: [{name:'expressions',list:true}],
    ObjectExpression: [{name:'properties',list:true}], //this is handled specially  
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
    ArrayPattern: null,
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
    ObjectPattern: null,
    RestElement: null,
    SpreadElement: null,
    Super: null,
    TaggedTemplateExpression: null
    
};

/** These are javascript keywords */
apogee.codeAnalysis.KEYWORDS = {
	"abstract": true,
	"arguments": true,
	"boolean": true,
	"break": true,
	"byte": true,
	"case": true,
	"catch": true,
	"char": true,
	"class": true,
	"const": true,
	"continue": true,
	"debugger": true,
	"default": true,
	"delete": true,
	"do": true,
	"double": true,
	"else": true,
	"enum": true,
	"eval": true,
	"export": true,
	"extends": true,
	"false": true,
	"final": true,
	"finally": true,
	"float": true,
	"for": true,
	"function": true,
	"goto": true,
	"if": true,
	"implements": true,
	"import": true,
	"in": true,
	"instanceof": true,
	"int": true,
	"interface": true,
	"let": true,
	"long": true,
	"native": true,
	"new": true,
	"null": true,
	"package": true,
	"private": true,
	"protected": true,
	"public": true,
	"return": true,
	"short": true,
	"static": true,
	"super": true,
	"switch": true,
	"synchronized": true,
	"this": true,
	"throw": true,
	"throws": true,
	"transient": true,
	"true": true,
	"try": true,
	"typeof": true,
	"var": true,
	"void": true,
	"volatile": true,
	"while": true,
	"with": true,
	"yield": true,
};

/** These are variable names we will not call out in setting the context.
 * NOTE - it is OK if we do not exclude a global variable. It will still work. */
apogee.codeAnalysis.EXCLUSION_NAMES = {
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
}

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
apogee.codeAnalysis.analyzeCode = function(functionText) {
    
    try {
        var returnValue = {};
        var ast = esprima.parse(functionText, { tolerant: true, loc: true });
    
        //check for errors in parsing
        if((ast.errors)&&(ast.errors.length > 0)) {
            returnValue.success = false;
            returnValue.errors = [];
            for(var i = 0; i < ast.errors.length; i++) {
                var astError = ast.errors[i];
                var actionError = new apogee.ActionError(astError.description,"Analyze - Code");
                actionError.setParentException(astError);
                returnValue.errors.push(actionError);
            }
        }
        
        //get the variable list
        var varInfo = apogee.codeAnalysis.getVariableInfo(ast);

        //return the variable info
        returnValue.success = true;
        returnValue.varInfo = varInfo;
        return returnValue;
    }
    catch(exception) {
        var actionError = apogee.ActionError.processException(exception,"Analyze - Code",false);
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
apogee.codeAnalysis.getVariableInfo = function(ast) {
    
    //create the var to hold the parse data
    var processInfo = {};
    processInfo.nameTable = {};
    processInfo.scopeTable = {};
    
    //create the base scope
    var scope = apogee.codeAnalysis.startScope(processInfo);

    //traverse the tree, recursively
    apogee.codeAnalysis.processTreeNode(processInfo,ast,false);
    
    //finish the base scope
    apogee.codeAnalysis.endScope(processInfo,scope);
    
    //finish analyzing the accessed variables
    apogee.codeAnalysis.markLocalVariables(processInfo);
    
    //return the variable names accessed
    return processInfo.nameTable;
}
    
/** This method starts a new loca variable scope, it should be called
 * when a function starts. 
 * @private */
apogee.codeAnalysis.startScope = function(processInfo) {
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
apogee.codeAnalysis.endScope = function(processInfo) {
    var currentScope = processInfo.currentScope;
    if(!currentScope) return;
    
    //set the scope to the parent scope.
    processInfo.currentScope = currentScope.parent;
}

/** This method analyzes the AST (abstract syntax tree). 
 * @private */
apogee.codeAnalysis.processTreeNode = function(processInfo,node,isDeclaration) {
    
    //process the node type
    if((node.type == "Identifier")||(node.type == "MemberExpression")) {
        //process a variable
        apogee.codeAnalysis.processVariable(processInfo,node,isDeclaration);
    } 
    else if((node.type == "FunctionDeclaration")||(node.type == "FunctionExpression")) {
        //process the functoin
        apogee.codeAnalysis.processFunction(processInfo,node);
        
    }
    else if((node.type === "NewExpression")&&(node.callee.type === "Function")) {
        //we currently do not support the function constructor
        //to add it we need to add the local variables and parse the text body
        throw apogee.codeAnalysis.createParsingError("Function constructor not currently supported!",node.loc); 
    }
    else {
        //process some other node
        apogee.codeAnalysis.processGenericNode(processInfo,node);
    }
}
   
/** This method process nodes that are not variabls identifiers. This traverses 
 * down the syntax tree.
 * @private */
apogee.codeAnalysis.processGenericNode = function(processInfo,node) {
    //load the syntax node info list for this node
    var nodeInfoList = apogee.codeAnalysis.syntax[node.type];
    
    //process this list
    if(nodeInfoList === undefined) {
        //node not found
        throw apogee.codeAnalysis.createParsingError("Syntax Tree Node not found: " + node.type,node.loc);
    }
    else if(nodeInfoList === null) {
        //node not supported
        throw apogee.codeAnalysis.createParsingError("Syntax node not supported: " + node.type,node.loc);
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
                        apogee.codeAnalysis.processTreeNode(processInfo,childField[j],nodeInfo.declaration);
                    }
                }
                else {
                    //this is a single node
                    apogee.codeAnalysis.processTreeNode(processInfo,childField,nodeInfo.declaration);
                }
            }
        }
    }
}

/** This method processes nodes that are function. For functions a new scope is created 
 * for the body of the function.
 * @private */
apogee.codeAnalysis.processFunction = function(processInfo,node) {
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
        apogee.codeAnalysis.processTreeNode(processInfo,idNode,true);
    }
    
    //create a new scope for this function
    var scope = apogee.codeAnalysis.startScope(processInfo);
    
    if((nodeType === "FunctionExpression")&&(idNode)) {
        //parse id node (variable name) in the parent scope
        apogee.codeAnalysis.processTreeNode(processInfo,idNode,true);
    }
    
    //process the variable list
    for(var i = 0; i < params.length; i++) {
        apogee.codeAnalysis.processTreeNode(processInfo,params[i],true);
    }
    
    //process the function body
    apogee.codeAnalysis.processTreeNode(processInfo,body,false);
    
    //end the scope for this function
    apogee.codeAnalysis.endScope(processInfo,scope);
}

/** This method processes nodes that are variables (identifiers and member expressions), adding
 * them to the list of variables which are used in tehe formula.
 * @private */
apogee.codeAnalysis.processVariable = function(processInfo,node,isDeclaration) {
    
    //get the variable path and the base name
    var namePath = this.getVariableDotPath(processInfo,node);
    if(!namePath) return;
    
    var baseName = namePath[0];
    
    //check if it is an excluded name - such as a variable name used by javascript
    if(apogee.codeAnalysis.EXCLUSION_NAMES[baseName]) {
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
apogee.codeAnalysis.getVariableDotPath = function(processInfo,node) {
    if(node.type == "Identifier") {
        //read the identifier name
        return [node.name];
    }
    else if(node.type == "MemberExpression") {
        if((node.object.type == "MemberExpression")||(node.object.type == "Identifier")) {
            //MEMBER EXPRESSION OR IDENTIFIER - variable name and/or path
            var variable = this.getVariableDotPath(processInfo,node.object);

            if(node.computed) {
                //COMPUTED CASE
                //We will not try to figure out what the child is. We will only make a dependence on 
                //the parent. This should work but it is too strong. For example
                //we may be including dependence on a while folder when really we depend
                //on a single child in the folder.
                this.processTreeNode(processInfo,node.property,false);
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
            this.processTreeNode(processInfo,node.object,false);
            
            return null;
        }
    }
    else {
        //this shouldn't happen. If it does we didn't code the syntax tree right
        throw this.createParsingError("Unknown application error: expected a variable identifier node.",node.loc);
    }
}

/** This method annotates the variable usages that are local variables. 
 * @private */
apogee.codeAnalysis.markLocalVariables = function(processInfo) {
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
apogee.codeAnalysis.createParsingError = function(errorMsg,location) {
    var error = apogee.base.createError(errorMsg,false);
    if(location) {
        error.lineNumber = location.start.line;
        error.column = location.start.column;
    }
    return error;
}
;

apogee.codeDependencies = {};

/** This method takes the varInfo table from the code analysis and returns
 * a lsit of member objects which this member depends on.
 */
apogee.codeDependencies.getDependencyInfo = function(varInfo,contextManager) {
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
                var impactor = contextManager.getImpactor(namePath);
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
};
/** This namespace contains functions to process an update to an member
 * which inherits from the FunctionBase component. */
apogee.calculation = {};


/** This moethod should be called on an member (impactor or dependent) that changes.
 * This will allow for any Dependents to be recaculated.
 * @private */
apogee.calculation.addToRecalculateList = function(recalculateList,member) {
    //if it is in the list, return
    if(recalculateList.indexOf(member) >= 0) return;
     
    //add this member to recalculate list if it needs to be executed
    if((member.isDependent)&&(member.needsCalculating())) {
        recalculateList.push(member);
        member.prepareForCalculate();
    }
        
    apogee.calculation.addDependsOnToRecalculateList(recalculateList,member);
}

apogee.calculation.addDependsOnToRecalculateList = function(recalculateList,member) {
    //add any member that depends on this one    
    var impactsList = member.getImpactsList();
    for(var i = 0; i < impactsList.length; i++) {
        apogee.calculation.addToRecalculateList(recalculateList,impactsList[i]);
    }
}



/** This calls execute for each member in the recalculate list. The return value
 * is false if there are any errors.
 * @private */
apogee.calculation.callRecalculateList = function(recalculateList,actionResponse) {
    var dependent;
    var i;
    var success = true;
    for(i = 0; i < recalculateList.length; i++) {
        dependent = recalculateList[i];
        if(dependent.getCalcPending()) {
            dependent.calculate();   
            if(dependent.hasError()) {
                var actionErrors = dependent.getErrors();
                if(actionErrors) {
                    for(var j = 0; j < actionErrors.length; j++) {
                        actionResponse.addError(actionErrors[j]);
                    }
                }
                success = false;
            }
        }
    }
    
    return success;
}
;
apogee.action = {};

/** This class encapsulates a response to an action. It include a success flag,
 * a list of ActionErrors, and a fatal flag. Success is set to true unless there
 * are errors set. The fatal flag indicates that one of the errors was a fatal error.
 * When processing an action, only model data errors should be set. A code error 
 * will be translated to a data error when recalculate is called. Application 
 * errors can also be set. */
apogee.ActionResponse = function() {
    this.success = true;
    this.errors = [];
    this.fatal = false;
}

/** This method adds an error to the error list for this action. It also sets 
 * success to false. */
apogee.ActionResponse.prototype.addError = function(actionError) {
    this.success = false;
    if(actionError.getIsFatal()) {
        this.fatal = true;
    }
    
    if(this.errors.indexOf(actionError) < 0) {
        this.errors.push(actionError);
    }
}

/** This method returns false if there were any errors during this action. */
apogee.ActionResponse.prototype.getSuccess = function() {
    return this.success;
}

/** This method returns false if there were any errors during this action. */
apogee.ActionResponse.prototype.getErrors = function() {
    return this.errors;
}

/** This method returns the error message for this action. It is only valid if success = false. */
apogee.ActionResponse.prototype.getErrorMsg = function() {
    return apogee.ActionResponse.getListErrorMsg(this.errors);
}

/** This method returns the error message for this action. It is only valid if success = false. */
apogee.ActionResponse.getListErrorMsg = function(errorList) {
    var msgList = errorList.map( actionError => {
        var msg = "";
        if(actionError.member) {
            msg += actionError.member.getName() + ": ";
        }
        msg += actionError.msg;
        return msg;
    });
    return msgList.join(";\n");
}
        




;


/** This method class is an action error object, to be used in an action return value. 
 * The error type is a classification string. If the error is associated with a member
 * the member can be set here. */
apogee.ActionError = function(msg,errorType,optionalMember) {
    this.msg = (msg != null) ? msg : apogee.ActionError.UNKNOWN_ERROR_MESSAGE;
    this.errorType = errorType;
    this.member = optionalMember;
    
    this.isFatal = false;
    this.parentException = null;
}

/* Error type Application - This is an error caused by the application. This is
 * may be shown to the user in a dialog. */
apogee.ActionError.ERROR_TYPE_APP = "AppException";
/** Error Type Model - This is an error that arises from the user code. Note that
 * rather than using this error type, a alternate descriptive string may be used. */
apogee.ActionError.ERROR_TYPE_MODEL = "ModelException";
/** Error Type User - this is operator error. */
apogee.ActionError.ERROR_TYPE_USER = "UserException";

/** This is used as the error message when no other error message is given. */
apogee.ActionError.UNKNOWN_ERROR_MESSAGE = "Unknown Error";


/** This sets the exception that triggered this error. */
apogee.ActionError.prototype.setParentException = function(exception) {
    this.parentException = exception;
}

/** This sets the exception that triggered this error. */
apogee.ActionError.prototype.setIsFatal= function(isFatal) {
    this.isFatal = isFatal;
}

/** This returns true if this is a fatal error. */
apogee.ActionError.prototype.getIsFatal= function() {
    return this.isFatal;
}

/** This gets the type of error. */
apogee.ActionError.prototype.getType= function() {
    return this.errorType;
}

/** This method processes a fatal application exception, returning an ActionError object
 * marked as fatal. This should be use when the app lication is left in an unknown state. 
 * The resulting error message is the message from the
 * exception. An optional prefix may be added using the argument optionalErrorMsgPrefix.
 * This method also prints the stack trace for the exception. */
apogee.ActionError.processException = function(exception,type,defaultToFatal,optionalErrorMsgPrefix) {  
    if(exception.stack) {
        console.error(exception.stack);
    }
    var errorMsg = optionalErrorMsgPrefix ? optionalErrorMsgPrefix : "";
    if(exception.message) errorMsg += exception.message;
    if(errorMsg.length == 0) errorMsg = "Unknown error";
    var actionError = new apogee.ActionError(errorMsg,type,null);
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
}


 ;
/** This component encapsulates the member functionality for objects in the workspace.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 *  
 * COMPONENT DEPENDENCIES:
 * 
 */
apogee.Member = {};
    
/** This serves as the constructor for the member object, when extending it. 
 * The owner should be the parent that holds this member or the object that holds
 * the hierarchy (maybe the workspace). If the owner is not a parent, this is typically
 * a folder and it is called the root folder. */
apogee.Member.init = function(name,generator) {
    this.id = apogee.Member._createId();
    this.name = name;
    
    this.data = null;
    this.impactsList = [];
    
    this.generator = generator;
    this.errors = []; 
    this.resultInvalid = false;
    this.resultPending = false;
}

apogee.Member.initOwner = function(owner) {
    this.owner = owner;
    if(owner.isParent) {
        this.owner.addChild(this);
    }
    else if(owner.isRootHolder) {
        this.owner.setRoot(this);
    }
}

apogee.Member.move = function(newName,newOwner) {
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
    //change name
    this.name = newName;
    
    //place in the new owner
    this.initOwner(newOwner);
}

/** This property tells if this object is a member.
 * This property should not be implemented on non-members. */
apogee.Member.isMember = true

/** this method gets the ID. It is not persistent and is valid only for this 
 * instance the workspace is opened. */
apogee.Member.getId = function() {
    return this.id;
}

/** this method gets the name. */
apogee.Member.getName = function() {
    return this.name;
}

/** This method returns the full name in dot notation for this object. */
apogee.Member.getFullName = function() {
    if(this.owner) {
        return this.owner.getPossesionNameBase() + this.name;
    }
    else {
        //this shouldn't happen
        return this.name;
    }
}

/** This method returns a display name for the member object. By default it returns
/* the object name but can by overriden by the member implementation. By setting 
 * the input argument "useFullPath" to true, the path is included with the name. */
apogee.Member.getDisplayName = function(useFullPath) {
    if(useFullPath) {
        return this.getFullName();
    }
    else {
        return this.name;
    }
}

/** This returns the owner for this member. */
apogee.Member.getOwner = function() {
    return this.owner;
}

/** This returns the parent for this member. For the root folder
 * this value is null. */
apogee.Member.getParent = function() {
    if((this.owner)&&(this.owner.isParent)) {
        return this.owner;
    }
    else {
        return null;
    }
}

/** this method gets the workspace. */
apogee.Member.getWorkspace = function() {
   if(this.owner) {
       return this.owner.getWorkspace();
   }
   else {
       return null;
   }
}

/** this method gets the root folder/namespace for this object. */
apogee.Member.getRoot = function() {
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
}

/** This method sets the pre calc error for this dependent. */
apogee.Member.addError = function(error) {
    this.errors.push(error);
}

/** This method sets the pre calc error for this dependent. */
apogee.Member.addErrors = function(errorList) {
    this.errors = this.errors.concat(errorList);
}

/** This method clears the error list. */
apogee.Member.clearErrors = function(type) {
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
}

/** This returns true if there is a pre calc error. */
apogee.Member.hasError = function() {
    return (this.errors.length > 0);
}

/** This returns the pre calc error. */
apogee.Member.getErrors = function() {
    return this.errors;
}

/** This returns true if the member is not up to date, typically
 * do to waiting on an asynchronous operation. */
apogee.Member.getResultPending = function() {
    return this.resultPending;
}

/** This sets the result pending flag. If is pending is set to true a
 * pending token must be set. (from apogee.action.getPendingToken) This 
 * is used to ensure only the latest asynchronous action is kept. */
apogee.Member.setResultPending = function(isPending,pendingToken) {
    this.resultPending = isPending;
    this.pendingToken = pendingToken;
}

/** This returns true if the member is invalid, typically
 * meaning the calculation could not properly be performed becase the
 * needed data is not available. */
apogee.Member.getResultInvalid = function() {
    return this.resultInvalid;
}

/** This sets the result invalid flag. If the result is invalid, any
 * table depending on this will also have an invalid value. */
apogee.Member.setResultInvalid = function(isInvalid) {
    this.resultInvalid = isInvalid;
}

/** This returns true if the pending token matches. */
apogee.Member.pendingTokenMatches = function(pendingToken) {
    return (this.pendingToken === pendingToken);
}

apogee.Member.getSetDataOk = function() {
    return this.generator.setDataOk;
}

/** This method writes the child to a json. */
apogee.Member.toJson = function() {
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
}

///** This method creates a member from a json. IT should be implemented as a static
// * function in extending objects. */ 
//apogee.Member.fromJson = function(owner,json,childrenJsonOutputList) {
//}

//-----------------------------------
// Data methods
//-----------------------------------

/** this method gets the data map. */
apogee.Member.getData = function() {
    return this.data;
}

/** This returns an array of members this member impacts. */
apogee.Member.getImpactsList = function() {
    return this.impactsList;
}

/** This method sets the data for this object. This is the object used by the 
 * code which is identified by this name, for example the JSON object associated
 * with a JSON table. Besides hold the data object, this updates the parent data map. */
apogee.Member.setData = function(data) {
    this.data = data;
  
    var parent = this.getParent();
    if(parent) {
        parent.updateData(this);
    }
}

//========================================
// "Protected" Methods
//========================================

/** This method is called when the member is deleted. If necessary the implementation
 * can extend this function, but it should call this base version of the function
 * if it does.  
 * @protected */
apogee.Member.onDeleteMember = function() {
    if(!(this.owner)) return;
    
	if(this.owner.isParent) {
		this.owner.removeChild(this);
	}
    else if(this.owner.isRootHolder) {
        this.owner.setRoot(null);
    }
    this.owner = null;
}

///** This method is called when the workspace is closed and also when an object
// * is deleted. It should do any needed cleanup for the object.  
// * @protected */
//apogee.Member.onClose = function();

//Implement this method if there is data to add to this member. Otherwise it may
//be omitted
///** This method adds any additional data to the json saved for this member. 
// * @protected */
//apogee.Member.addToJson = function(json) {
//}

//Implement this method if there is update data for this json. otherwise it may
//be omitted
///** This gets an update structure to upsate a newly instantiated member
//* to match the current object. It may return "undefined" if there is no update
//* data needed. 
//* @protected */
//apogee.Member.getUpdateData = function() {
//}


//===================================
// Private Functions
//===================================

/** This method adds a data member to the imapacts list for this node.
 * The return value is true if the member was added and false if it was already there. 
 * @private */
apogee.Member.addToImpactsList = function(member) {
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
}

/** This method removes a data member from the imapacts list for this node. 
 * @private */
apogee.Member.removeFromImpactsList = function(member) {
    //it should appear only once
    for(var i = 0; i < this.impactsList.length; i++) {
        if(this.impactsList[i] == member) {
            this.impactsList.splice(i,1);
            return;
        }
    }
}

/** This is used for Id generation.
 * @private */
apogee.Member.nextId = 1;

/** This method generates a member ID for the member. It is only valid
 * for the duration the workspace is opened. It is not persisted.
 * @private
 */
apogee.Member._createId = function() {
    return apogee.Member.nextId++;
}

;
/** This component encapsulates an object that has a context manager.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 */
apogee.ContextHolder = {};

/** This initializes the component */
apogee.ContextHolder.init = function() {
    //will be set on demand
    this.contextManager = null;
}

apogee.ContextHolder.isContextHolder = true;

/** This method retrieves the context manager. */
apogee.ContextHolder.getContextManager = function() {
    if(!this.contextManager) {
        //set the context manager
        this.contextManager = this.createContextManager();
    }
    
    return this.contextManager;
}

//this method must be implemneted in extending classes
///** This method retrieve creates the loaded context manager. */
//apogee.ContextHolder.createContextManager = function();

apogee.ContextManager.prototype.getImpactor = function(path) {
    
    return this.hierarchicalLookup("lookupImpactor",path);
}

///** This method looks up a member by name, where the name is the name of
// * the variable as accessed from the context of this member. */
//apogee.ContextHolder.lookupMemberByName = function(variableName) {
//    var path = fullName.split(".");
//    var contextManager =  this.getContextManager();
//    return contextManager.getImpactor(path);
//}




;
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
apogee.Dependent = {};

/** This initializes the component */
apogee.Dependent.init = function() {
    
    //this is the list of dependencies
    this.dependsOnList = [];
    this.calcPending = false;
}

/** This property tells if this object is a dependent.
 * This property should not be implemented on non-dependents. */
apogee.Dependent.isDependent = true;

/** This returns a list of the members that this member depends on. */
apogee.Dependent.getDependsOn = function() {
    return this.dependsOnList;
}

/** This returns the calc pending flag.  */
apogee.Dependent.getCalcPending = function() {
    return this.calcPending;
}

/** This sets the calc pending flag to false. It should be called when the 
 * calcultion is no longer needed.  */
apogee.Dependent.clearCalcPending = function() {
    this.calcPending = false;
}

//Must be implemented in extending object
///** This method udpates the dependencies if needed because
// *a variable was added or removed from the workspace.  */
//apogee.Dependent.updateDependeciesForModelChange = function(object);

///** This is a check to see if the object should be checked for dependencies 
// * for recalculation. It is safe for this method to always return false and
// allow the calculation to happen. 
// * @private */
//apogee.Dependent.needsCalculating = function();

/** This does any init needed for calculation.  */
apogee.Dependent.prepareForCalculate = function() {
    this.clearErrors();
    this.setResultPending(false);
    this.setResultInvalid(false);
    this.calcPending = true;
}

///** This updates the member based on a change in a dependency.  */
//apogee.Dependent.calculate = function();

/** This method makes sure any impactors are set. It sets a dependency 
 * error if one or more of the dependencies has a error. */
apogee.Dependent.initializeImpactors = function() {
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
        this.setResultPending(true,apogee.action.DEPENDENT_PENDING_TOKEN);
    }
    else if(resultInvalid) {
        this.setResultInvalid(true);
    }
}

/** This method does any needed cleanup when the dependent is depeted.. */
apogee.Dependent.onDeleteDependent = function() {
    //remove this dependent from the impactor
    for(var i = 0; i < this.dependsOnList.length; i++) {
        var remoteMember = this.dependsOnList[i];
        //remove from imacts list
        remoteMember.removeFromImpactsList(this);
    }
}
//===================================
// Private Functions
//===================================

/** This sets the dependencies based on the code for the member. */
apogee.Dependent.updateDependencies = function(newDependsOn) {
    
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
}

/** This method creates an dependency error, given a list of impactors that have an error. 
 * @private */
apogee.Dependent.createDependencyError = function(errorDependencies) {
        //dependency error found
        var message = "Error in dependency: ";
        for(var i = 0; i < errorDependencies.length; i++) {
            if(i > 0) message += ", ";
            message += errorDependencies[i].getFullName();
        }
        var actionError = new apogee.ActionError(message,"Calculation - Dependency",this);
        this.addError(actionError);   

}
;
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
 */
apogee.Codeable = {};

/** This initializes the component. argList is the arguments for the object function. */
apogee.Codeable.init = function(argList) {
    
    //arguments of the member function
    this.argList = argList;
    
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
    
    //fields used in calculation
    this.calcInProgress = false;
    this.functionInitialized = false;
    this.initReturnValue = false;
}

/** This property tells if this object is a codeable.
 * This property should not be implemented on non-codeables. */
apogee.Codeable.isCodeable = true

apogee.Codeable.getSetCodeOk = function() {
    return this.generator.setCodeOk;
}

/** This method returns the argument list.  */
apogee.Codeable.getArgList = function() {
    return this.argList;
}

/** This method returns the fucntion body for this member.  */
apogee.Codeable.getFunctionBody = function() {
    return this.functionBody;
}

/** This method returns the supplemental code for this member.  */
apogee.Codeable.getSupplementalCode = function() {
    return this.supplementalCode;
}

/** This method returns the supplemental code for this member.  */
apogee.Codeable.getDescription = function() {
    return this.description;
}

/** This method returns the supplemental code for this member.  */
apogee.Codeable.setDescription = function(description) {
    this.description = description;
}

/** This method returns the formula for this member.  */
apogee.Codeable.setCodeInfo = function(codeInfo,compiledInfo) {

    //set the base data
    this.argList = codeInfo.argList;
    this.functionBody = codeInfo.functionBody;
    this.supplementalCode = codeInfo.supplementalCode;

    //save the variables accessed
    this.varInfo = compiledInfo.varInfo;

    if((!compiledInfo.errors)||(compiledInfo.errors.length === 0)) {
        //set the code  by exectuing generator
        try {
            //get the inputs to the generator
            var messenger = new apogee.action.Messenger(this);
            
            //get the generated fucntion
            var generatedFunctions = compiledInfo.generatorFunction(messenger);
            this.memberGenerator = generatedFunctions.memberGenerator;
            this.memberFunctionInitializer = generatedFunctions.initializer;            
            
            this.codeErrors = [];
        }
        catch(ex) {
            this.codeErrors.push(apogee.ActionError.processException(ex,"Codeable - Set Code",false));
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
}

/** This method returns the formula for this member.  */
apogee.Codeable.initializeDependencies = function() {
    
    if((this.hasCode())&&(this.varInfo)&&(this.codeErrors.length === 0)) {
        try {
            var newDependencyList = apogee.codeDependencies.getDependencyInfo(this.varInfo,
                   this.getContextManager());

            //update dependencies
            this.updateDependencies(newDependencyList);
        }
        catch(ex) {
            this.codeErrors.push(apogee.ActionError.processException(ex,"Codeable - Set Dependencies",false));
        }
    }
    else {
        //will not be calculated - has no dependencies
        this.updateDependencies([]);
    }
}

/** This method udpates the dependencies if needed because
 *the passed variable was added.  */
apogee.Codeable.updateDependeciesForModelChange = function(recalculateList) {
    if((this.hasCode())&&(this.varInfo)) {
                  
        //calculate new dependencies
        var newDependencyList = apogee.codeDependencies.getDependencyInfo(this.varInfo,
               this.getContextManager());
          
        //update the dependency list
        var dependenciesChanged = this.updateDependencies(newDependencyList);
        if(dependenciesChanged) {
            //add to update list
            apogee.calculation.addToRecalculateList(recalculateList,this);
        }  
    }
}
    
/** This method returns the formula for this member.  */
apogee.Codeable.clearCode = function() {
    this.codeSet = false;
    this.functionBody = "";
    this.supplementalCode = "";
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
}

/** This method returns the formula for this member.  */
apogee.Codeable.hasCode = function() {
    return this.codeSet;
}

/** If this is true the member is ready to be executed. 
 * @private */
apogee.Codeable.needsCalculating = function() {
	return this.codeSet;
}

/** This does any init needed for calculation.  */
apogee.Codeable.prepareForCalculate = function() {
    //call the base function
    apogee.Dependent.prepareForCalculate.call(this);
    
    this.functionInitialized = false;
    this.initReturnValue = false;
}

/** This method sets the data object for the member.  */
apogee.Codeable.calculate = function() {
    if(this.codeErrors.length > 0) {
        this.addErrors(this.codeErrors);
        this.clearCalcPending();
        return;
    }
    
    if((!this.memberGenerator)||(!this.memberFunctionInitializer)) {
        var msg = "Function not found for member: " + this.getName();
        var actionError = new apogee.ActionError(msg,"Codeable - Calculate",this);
        this.addError(actionError);
        this.clearCalcPending();
        return;
    } 
    
    try {
        this.processMemberFunction(this.memberGenerator);
    }
    catch(error) {
        if(error == apogee.base.MEMBER_FUNCTION_INVALID_THROWABLE) {
            //This is not an error. I don't like to throw an error
            //for an expected condition, but I didn't know how else
            //to do this. See notes where this is thrown.
            this.setResultInvalid(true);
        }
        else if(error == apogee.base.MEMBER_FUNCTION_PENDING_THROWABLE) {
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
            var actionError = new apogee.ActionError(errorMsg,"Codeable - Calculate",this);
            actionError.setParentException(error);
            this.addError(actionError);
        }
    }
    
    this.clearCalcPending();
}

/** This makes sure user code of object function is ready to execute.  */
apogee.Codeable.memberFunctionInitialize = function() {
    
    if(this.functionInitialized) return this.initReturnValue;
    
    //make sure this in only called once
    if(this.calcInProgress) {
        var errorMsg = "Circular reference error";
        var actionError = new apogee.ActionError(errorMsg,"Codeable - Calculate",this);
        this.addError(actionError);
        //clear calc in progress flag
        this.calcInProgress = false;
        this.functionInitialized = true;
        this.initReturnValue = false;
        return this.initReturnValue;
    }
    this.calcInProgress = true;
    
    try {
        
        //make sure the data is set in each impactor
        this.initializeImpactors();
        if((this.hasError())||(this.getResultPending())||(this.getResultInvalid())) {
            this.calcInProgress = false;
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
        var actionError = new apogee.ActionError(errorMsg,"Codeable - Calculate",this);
        actionError.setParentException(error);
        this.addError(actionError);
        this.initReturnValue = false;
    }
    
    this.calcInProgress = false;
    this.functionInitialized = true;
    return this.initReturnValue;
}

//------------------------------
// Member Methods
//------------------------------

/** This gets an update structure to upsate a newly instantiated member
/* to match the current object. */
apogee.Codeable.getUpdateData = function() {
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
}

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
apogee.Codeable.createContextManager = function() {
    return new apogee.ContextManager(this);
}

//===================================
// Private Functions
//===================================

//implementations must implement this function
//This method takes the object function generated from code and processes it
//to set the data for the object. (protected)
//apogee.Codeable.processMemberFunction 

;
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
apogee.Owner = {};

/** This initializes the component */
apogee.Owner.init = function() {
}

apogee.Owner.isOwner = true;

//must be implemented in extending object
///** This method retrieves the workspace for the child of this owner. */
//apogee.Owner.getWorkspace = function();

//must be implemented in extending object
///** This method retrieves the full name whichis relevent for a root folder owned
// * by this object. */
//apogee.Owner.getPossesionNameBase = function();

//must be implented by extending object
///** This method retrieves the context manager for this owner. */
//apogee.Owner.getContextManager = function();

/** This method looks up a member by its full name. */
apogee.Owner.getMemberByFullName = function(fullName) {
    var path = fullName.split(".");
    return this.getMemberByPathArray(path);
}

///** This method looks up a member by an array path. The start element is
// * the index of the array at which to start. */
//apogee.Owner.getMemberByPathArray = function(path,startElement);

///** This method is called when the workspace is closed.
// It should do any needed cleanup for the object. */
//apogee.Owner.onClose = function();

;
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
apogee.Parent = {};

/** This is the name for the root. */
apogee.Parent.ROOT_NAME = "root";

/** This initializes the component */
apogee.Parent.init = function() {
    this.childrenWriteable = true;
}

apogee.Parent.isParent = true;


/** this is used to identify if this is the root folder. */
apogee.Parent.isRoot = function() {
    //undefined may be OK too. If there is populated object this is not root.
    return (this.getParent() == null); 
}

///** this method gets a map of child names to children. This may not be the structure
// * of the data in the parent, but it is the prefered common representation. */
//apogee.Parent.getChildMap = function();

// Must be implemented in extending object
///** This method looks up a child from this folder.  */
//apogee.Folder.lookupChild = function(name);

/** This method looks up a child using an arry of names corresponding to the
 * path from this folder to the object.  The argument startElement is an optional
 * index into the path array for fodler below the root folder. */
apogee.Parent.lookupChildFromPathArray = function(path,startElement) {
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
}

/** This method allows the UI to decide if the user can add children to it. This
 * value defaults to true. */
apogee.Parent.getChildrenWriteable = function() {
    return this.childrenWriteable;
}

/** This method sets the writeable property for adding child members. This value of
 * the method is not enforced (since children must be added one way or another). */
apogee.Parent.setChildrenWriteable = function(writeable) {
    this.childrenWriteable = writeable; 
}

// Must be implemented in extending object
///** This method adds the child to this parent. 
// * It will fail if the name already exists.  */
//apogee.Parent.addChild = function(child);

// Must be implemented in extending object
///** This method removes this child from this parent.  */
//apogee.Parent.removeChild = function(child);

// Must be implemented in extending object
///** This method updates the data object for this child. */
//apogee.Parent.updateData = function(child);

///** This method is called when the workspace is closed. 
//* It should do any needed cleanup for the object. */
//apogee.Parent.onClose = function();

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
apogee.Parent.createContextManager = function() {
    //set the context manager
    var contextManager = new apogee.ContextManager(this);
    //add an entry for this folder. Make it local unless this si a root folder
    var myEntry = {};
    myEntry.parent = this;
    contextManager.addToContextList(myEntry);
    
    return contextManager;
}

//------------------------------
//Owner methods
//------------------------------

/** This method returns the full name in dot notation for this object. */
//apogee.Parent.getFullName = function() {
//    return apogee.Member.getFullName.call(this);
//}

/** this method gets the hame the children inherit for the full name. */
apogee.Parent.getPossesionNameBase = function() {
    return this.getFullName() + ".";
}

;
/** This component encapsulates an owner object which is not a member and it contains a single child (usually a folder) which
 * is the "root" object for a hierarchy.
 * 
 * This is a mixin and not a class. It is used for the prototype of the objects that inherit from it.
 * 
 * COMPONENT DEPENDENCIES:
 * - A RootHolder must be an Owner.
 */
apogee.RootHolder = {};

/** This initializes the component */
apogee.RootHolder.init = function() {
}

apogee.RootHolder.isRootHolder = true;

// Must be implemented in extending object
///** This method sets the root object.  */
//apogee.RootHolder.setRoot = function(member);

// Must be implemented in extending object
///** This method returns the root object.  */
//apogee.RootHolder.getRoot = function();

;
/** This is the workspace. Typically owner should be null. It
 * is used for creating virtual workspaces. */
apogee.Workspace = function(optionalJson,actionResponseForJson,ownerForVirtualWorkspace) {
    //base init
    apogee.EventManager.init.call(this);
    apogee.ContextHolder.init.call(this);
    apogee.Owner.init.call(this);
    apogee.RootHolder.init.call(this);
    
    // This is a queue to hold actions while one is in process.
    this.isDirty = false;
    this.actionInProgress = false;
    this.actionQueue = [];
    this.name = apogee.Workspace.DEFAULT_WORKSPACE_NAME;
    
    if(ownerForVirtualWorkspace === undefined) ownerForVirtualWorkspace = null;
    this.owner = ownerForVirtualWorkspace;
    
    if(!optionalJson) {
        this.rootFolder = new apogee.Folder(apogee.Workspace.ROOT_FOLDER_NAME,this);
    }
    else {
        this.loadFromJson(optionalJson,actionResponseForJson);
    }
}

//add components to this class
apogee.base.mixin(apogee.Workspace,apogee.EventManager);
apogee.base.mixin(apogee.Workspace,apogee.ContextHolder);
apogee.base.mixin(apogee.Workspace,apogee.Owner);
apogee.base.mixin(apogee.Workspace,apogee.RootHolder);


apogee.Workspace.DEFAULT_WORKSPACE_NAME = "Workspace";
apogee.Workspace.ROOT_FOLDER_NAME = "Model";

/** this method should be used to set the workspace as dirty, meaning it has 
 * new data to be saved. */
apogee.Workspace.prototype.setIsDirty = function() {
    this.isDirty = true;
}

/** This method returns true if the workspace needs to be saved. */
apogee.Workspace.prototype.getIsDirty = function() {
    return this.isDirty;
}

/** This method clears the is dirty flag. */
apogee.Workspace.prototype.clearIsDirty = function() {
    this.isDirty = false;
}

/** This method returns the root object - implemented from RootHolder.  */
apogee.Workspace.prototype.setName = function(name) {
    this.name = name;
}

/** This method returns the root object - implemented from RootHolder.  */
apogee.Workspace.prototype.getName = function() {
    return this.name;
}

/** This method returns the root object - implemented from RootHolder.  */
apogee.Workspace.prototype.getRoot = function() {
    return this.rootFolder;
}

/** This method sets the root object - implemented from RootHolder.  */
apogee.Workspace.prototype.setRoot = function(member) {
    this.rootFolder = member;
}

/** This allows for a workspace to have a parent. For a normal workspace this should be null. 
 * This is used for finding variables in scope. */
apogee.Workspace.prototype.getOwner = function() {
    return this.owner;
}

/** This method updates the dependencies of any children in the workspace. */
apogee.Workspace.prototype.updateDependeciesForModelChange = function(recalculateList) {
    if(this.rootFolder) {
        this.rootFolder.updateDependeciesForModelChange(recalculateList);
    }
}

/** This method removes any data from this workspace on closing. */
apogee.Workspace.prototype.onClose = function() {
    this.rootFolder.onClose();
}

/** This function triggers the action for the queued action to be run when the current thread exits. */
apogee.Workspace.prototype.isActionInProgress = function() {
    return this.actionInProgress;
}

apogee.Workspace.prototype.setActionInProgress = function(inProgress) {
    this.actionInProgress = inProgress;
}

apogee.Workspace.prototype.queueAction = function(actionInfo) {
    this.actionQueue.push(actionInfo);
}

apogee.Workspace.prototype.getQueuedAction = function() {
    if(this.actionQueue.length > 0) {
        var queuedActionInfo = this.actionQueue[0];
        this.actionQueue.splice(0,1)
        return queuedActionInfo;
    }
    else {
        return null;
    }
}


//------------------------------
// Owner Methods
//------------------------------

/** this method is implemented for the Owner component/mixin. */
apogee.Workspace.prototype.getWorkspace = function() {
   return this;
}

/** this method gets the hame the children inherit for the full name. */
apogee.Workspace.prototype.getPossesionNameBase = function() {
    //the name starts over at a new workspace
    return "";
}

/** This method looks up a member by its full name. */
apogee.Workspace.prototype.getMemberByPathArray = function(path,startElement) {
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
}

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
apogee.Workspace.prototype.createContextManager = function() {
    //set the context manager
    var contextManager = new apogee.ContextManager(this);
    
    if(this.owner) {
        //get the context of the owner, but flattened so we don't reference
        //the owner's tables
        apogee.Workspace.flattenParentIntoContextManager(contextManager,this.owner);
    }
    else {
        //global variables from window object
        var globalVarEntry = {};
        globalVarEntry.data = __globals__;
        contextManager.addToContextList(globalVarEntry);
    }
    
    return contextManager;
}


//==========================
//virtual workspace methods
//==========================

/** This method makes a virtual workspace that contains a copy of the give folder
 * as the root folder. Optionally the context manager may be set. */
apogee.Workspace.createVirtualWorkpaceFromFolder = function(name,origRootFolder,ownerInWorkspace) {
	//create a workspace json from the root folder json
	var workspaceJson = {};
    workspaceJson.fileType = apogee.Workspace.SAVE_FILE_TYPE;
    workspaceJson.version = apogee.Workspace.SAVE_FILE_VERSION;
    workspaceJson.data = origRootFolder.toJson();
	
    var virtualWorkspace = new apogee.Workspace(workspaceJson,null,ownerInWorkspace);
    
    return virtualWorkspace;
}

//this is a cludge. look into fixing it.
apogee.Workspace.flattenParentIntoContextManager = function(contextManager,virtualWorkspaceParent) {
    for(var owner = virtualWorkspaceParent; owner != null; owner = owner.getOwner()) {
        var ownerContextManager = owner.getContextManager();
        var contextList = ownerContextManager.contextList; //IF WE USE THIS WE NEED TO MAKE IT ACCESSIBLE!
        for(var i = 0; i < contextList.length; i++) {
            var contextEntry = contextList[i];
            //only take non-local entries
            if(contextEntry.parent) {
                //add this entry after converting it to a data entry, 
                contextManager.addToContextList(apogee.Workspace.convertToDataContextEntry(contextEntry));
            }
            else if(contextEntry.data) {
                //already a data entry - add it directly
                contextManager.addToContextList(contextEntry);
            }
            else {
                //unknown case - ignore
            }
        }
    }
}

apogee.Workspace.convertToDataContextEntry = function(contextEntry) {
    var contextDataEntry = {};
    contextDataEntry.data = contextEntry.parent.getData();
    return contextDataEntry;
}
    
//============================
// Save Functions
//============================

/** This is the supported file type. */
apogee.Workspace.SAVE_FILE_TYPE = "apogee workspace";

/** This is the supported file version. */
apogee.Workspace.SAVE_FILE_VERSION = 0.2;

/** This saves the workspace. It the optionalSavedRootFolder is passed in,
 * it will save a workspace with that as the root folder. */
apogee.Workspace.prototype.toJson = function(optionalSavedRootFolder) {
    var json = {};
    json.fileType = apogee.Workspace.SAVE_FILE_TYPE;
    json.version = apogee.Workspace.SAVE_FILE_VERSION;
    
    json.name = this.name;
    
    var rootFolder;
    if(optionalSavedRootFolder) {
        rootFolder = optionalSavedRootFolder;
    }
    else {
        rootFolder = this.rootFolder;
    }
    
    //components
    json.data = rootFolder.toJson();
    
    return json;
}


/** This is loads data from the given json into this workspace. 
 * @private */
apogee.Workspace.prototype.loadFromJson = function(json,actionResponse) {
    var fileType = json.fileType;
	if(fileType !== apogee.Workspace.SAVE_FILE_TYPE) {
		throw apogee.base.createError("Bad file format.",false);
	}
    if(json.version !== apogee.Workspace.SAVE_FILE_VERSION) {
        throw apogee.base.createError("Incorrect file version. CHECK APOGEEJS.COM FOR VERSION CONVERTER.",false);
    }
	
    if(!actionResponse) actionResponse = new apogee.ActionResponse();
    
    if(json.name !== undefined) {
        this.name = json.name;
    }

    var actionData = {};
    actionData.action = "createMember";
    actionData.owner = this;
    actionData.workspace = this;
    actionData.createData = json.data;
    apogee.action.doAction(actionData,false,actionResponse);
    
    return actionResponse;
}

//================================
// Member generator functions
//================================

apogee.Workspace.memberGenerators = {};

/** This methods retrieves the member generator for the given type. */
apogee.Workspace.getMemberGenerator = function(type) {
    return apogee.Workspace.memberGenerators[type];
}

/** This method registers the member generator for a given named type. */
apogee.Workspace.addMemberGenerator = function(generator) {
    apogee.Workspace.memberGenerators[generator.type] = generator;
};
/** This class encapsulatees a data table for a JSON object */
apogee.JsonTable = function(name,owner,initialData) {
    //base init
    apogee.Member.init.call(this,name,apogee.JsonTable.generator);
    apogee.Dependent.init.call(this);
    apogee.ContextHolder.init.call(this);
	apogee.Codeable.init.call(this,[],true);
    
    this.initOwner(owner);
    
    //set initial data
    if(!initialData) {
        //default initail value
        initialData = {};
        initialData.data = "";
    }  

    if(initialData.functionBody !== undefined) {
        apogee.updatemember.applyCode(this,
            initialData.argList,
            initialData.functionBody,
            initialData.supplementalCode);
    }
    else {
        if(initialData.data === undefined) initialData.data = "";
        
        apogee.updatemember.applyData(this,
            initialData.data);
    }
    if(initialData.description !== undefined) {
        this.setDescription(initialData.description);
    }
}

//add components to this class
apogee.base.mixin(apogee.JsonTable,apogee.Member);
apogee.base.mixin(apogee.JsonTable,apogee.Dependent);
apogee.base.mixin(apogee.JsonTable,apogee.ContextHolder);
apogee.base.mixin(apogee.JsonTable,apogee.Codeable);

//------------------------------
// Codeable Methods
//------------------------------

/** This method returns the argument list. We override it because
 * for JsonTable it gets cleared when data is set. However, whenever code
 * is used we want the argument list to be this value. */
apogee.JsonTable.prototype.getArgList = function() {
    return [];
}
	
apogee.JsonTable.prototype.processMemberFunction = function(memberGenerator) {
    
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
    
    if(data === apogee.util.INVALID_VALUE) {
        //value is invalid if return is this predefined value
        this.setResultInvalid(true);
    }
    else if(apogee.base.isPromise(data)) {
        //if the return value is a Promise, the data is asynch asynchronous!

        //set pending manually here rather than doing below in a separate action
        var token = apogee.action.getAsynchToken();
        this.setResultPending(true,token);
        
        var instance = this;
       
        var asynchCallback = function(memberValue) {
            //set the data for the table, along with triggering updates on dependent tables.
            var actionData = {};
            actionData.action = "asynchFormulaData";
            actionData.member = instance;
            actionData.token = token;
            actionData.data = memberValue;
            var actionResponse =  apogee.action.doAction(actionData,false);
        }
        var asynchErrorCallback = function(errorMsg) {
            var actionData = {};
            actionData.action = "updateError";
            actionData.member = instance;
            actionData.token = token;
            actionData.errorMsg = errorMsg;
            var actionResponse =  apogee.action.doAction(actionData,false);
        }

        //call appropriate action when the promise resolves.
        data.then(asynchCallback).catch(asynchErrorCallback);
    }
    else {
        //result is synchronous
        this.setData(data);
    }
}

//------------------------------
// Member Methods
//------------------------------

/** This method extends set data from member. It also
 * freezes the object so it is immutable. (in the future we may
 * consider copying instead, or allowing a choice)*/
apogee.JsonTable.prototype.setData = function(data) {
    
	//make this object immutable
	apogee.base.deepFreeze(data);

	//store the new object
    return apogee.Member.setData.call(this,data);
}

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
apogee.JsonTable.fromJson = function(owner,json) {
    return new apogee.JsonTable(json.name,owner,json.updateData);
}

//============================
// Static methods
//============================

apogee.JsonTable.generator = {};
apogee.JsonTable.generator.displayName = "Table";
apogee.JsonTable.generator.type = "apogee.JsonTable";
apogee.JsonTable.generator.createMember = apogee.JsonTable.fromJson;
apogee.JsonTable.generator.setDataOk = true;
apogee.JsonTable.generator.setCodeOk = true;

//register this member
apogee.Workspace.addMemberGenerator(apogee.JsonTable.generator);;
/** This is a function. */
apogee.FunctionTable = function(name,owner,initialData) {
    //base init
    apogee.Member.init.call(this,name,apogee.FunctionTable.generator);
    apogee.Dependent.init.call(this);
    apogee.ContextHolder.init.call(this);
	apogee.Codeable.init.call(this,argList,false);
    
    this.initOwner(owner);
    
    //set initial data
    var argList = initialData.argList ? initialData.argList : [];
    var functionBody = initialData.functionBody ? initialData.functionBody : "";
    var supplementalCode = initialData.supplementalCode ? initialData.supplementalCode : "";
    apogee.updatemember.applyCode(this,argList,functionBody,supplementalCode);
    if(initialData.description !== undefined) {
        this.setDescription(initialData.description);
    }
}

//add components to this class
apogee.base.mixin(apogee.FunctionTable,apogee.Member);
apogee.base.mixin(apogee.FunctionTable,apogee.Dependent);
apogee.base.mixin(apogee.FunctionTable,apogee.ContextHolder);
apogee.base.mixin(apogee.FunctionTable,apogee.Codeable);

//------------------------------
// Codeable Methods
//------------------------------

apogee.FunctionTable.prototype.processMemberFunction = function(memberGenerator) {
    var memberFunction = this.getLazyInitializedMemberFunction(memberGenerator);
	this.setData(memberFunction);
}

apogee.FunctionTable.prototype.getLazyInitializedMemberFunction = function(memberGenerator) {
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
                issue = apogee.base.MEMBER_FUNCTION_PENDING_THROWABLE;
            }
            else if(instance.getResultInvalid()) {
                issue = apogee.base.MEMBER_FUNCTION_INVALID_THROWABLE;
            }
            else {
                issue = new Error("Unknown problem in initializing: " + instance.getFullName());
            }
            
            throw issue;
        } 
    }

    //this is called from separate code to make debugging more readable
    return __functionTableWrapper(initMember);
}

//------------------------------
// Member Methods
//------------------------------

/** This overrides the get title method of member to return the function declaration. */
apogee.FunctionTable.prototype.getDisplayName = function(useFullPath) {
    var name = useFullPath ? this.getFullName() : this.getName();
    var argList = this.getArgList();
    var argListString = argList.join(",");
    return name + "(" + argListString + ")";
}

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
apogee.FunctionTable.fromJson = function(owner,json) {
    return new apogee.FunctionTable(json.name,owner,json.updateData);
}

/** This method extends the base method to get the property values
 * for the property editting. */
apogee.FunctionTable.addPropValues = function(member,values) {
    var argList = member.getArgList();
    var argListString = argList.toString();
    values.argListString = argListString;
    return values;
}

/** This method executes a property update. */
apogee.FunctionTable.getPropertyUpdateAction = function(member,oldValues,newValues) {
    if(oldValues.argListString !== newValues.argListString) {
        var newArgList = apogee.FunctionTable.parseStringArray(newValues.argListString);
  
        var actionData = {};
        actionData.action = "updateCode";
        actionData.member = member;
        actionData.argList = newArgList;
        actionData.functionBody = member.getFunctionBody();
        actionData.supplementalCode = member.getSupplementalCode();
        return actionData;
    }
    else {
        return null;
    }
}

/** This methdo parses an arg list string to make an arg list array. It is
 * also used outisde this class. */
apogee.FunctionTable.parseStringArray = function(argListString) {
    var argList = argListString.split(",");
    for(var i = 0; i < argList.length; i++) {
        argList[i] = argList[i].trim();
    }
    return argList;
}

//============================
// Static methods
//============================

apogee.FunctionTable.generator = {};
apogee.FunctionTable.generator.displayName = "Function";
apogee.FunctionTable.generator.type = "apogee.FunctionTable";
apogee.FunctionTable.generator.createMember = apogee.FunctionTable.fromJson;
apogee.FunctionTable.generator.addPropFunction = apogee.FunctionTable.addPropValues;
apogee.FunctionTable.generator.getPropertyUpdateAction = apogee.FunctionTable.getPropertyUpdateAction;
apogee.FunctionTable.generator.setDataOk = false;
apogee.FunctionTable.generator.setCodeOk = true;

//register this member
apogee.Workspace.addMemberGenerator(apogee.FunctionTable.generator);


;
/** This class encapsulatees a data table for a jvascript object
 * There are two problems with this right now
 * 1) This freezes the object the sme way it freezes a JSON object, however, a 
 * javascript object can have loops, which will cause an infinite code loop.
 * 2) The real bad think about this is that a javascript object can be used to store state,
 * which will invalidate some of our functional programming/immutable concept. I think
 * maybe we want to not use this. (Note, this problem also can exist in a function. We
 * should figure out how to prevent it there if possible.)
 * 
 *  What I really want out of this is an object that is like a JSON but allows functions.
 *  
 *   TBD on if we actually use this. 
 * */
apogee.JavascriptTable = function(name,owner,initialData) {
    //base init
    apogee.Member.init.call(this,name,apogee.JavascriptTable.generator);
    apogee.Dependent.init.call(this);
    apogee.ContextHolder.init.call(this);
	apogee.Codeable.init.call(this,[],true);
    
    this.initOwner(owner);
    
    //set initial data
    if(!initialData) {
        //default initail value
        initialData = {};
        initialData.data = "";
    }  

    if(initialData.functionBody !== undefined) {
        apogee.updatemember.applyCode(this,
            initialData.argList,
            initialData.functionBody,
            initialData.supplementalCode);
    }
    else {
        if(initialData.data === undefined) initialData.data = "";
        
        apogee.updatemember.applyData(this,
            initialData.data);
    }
    if(initialData.description !== undefined) {
        this.setDescription(initialData.description);
    }
}

//add components to this class
apogee.base.mixin(apogee.JavascriptTable,apogee.Member);
apogee.base.mixin(apogee.JavascriptTable,apogee.Dependent);
apogee.base.mixin(apogee.JavascriptTable,apogee.ContextHolder);
apogee.base.mixin(apogee.JavascriptTable,apogee.Codeable);

//------------------------------
// Codeable Methods
//------------------------------

/** This method returns the argument list. We override it because
 * for JavascriptTable it gets cleared when data is set. However, whenever code
 * is used we want the argument list to be this value. */
apogee.JavascriptTable.prototype.getArgList = function() {
    return [];
}
	
apogee.JavascriptTable.prototype.processMemberFunction = function(memberGenerator) {
    
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
    
    
    if(data === apogee.util.INVALID_VALUE) {
        //value is invalid if return is this predefined value
        this.setResultInvalid(true);
    }
    else if(apogee.base.isPromise(data)) {
        //if the return value is a Promise, the data is asynch asynchronous!

        //set pending manually here rather than doing below in a separate action
        var token = apogee.action.getAsynchToken();
        this.setResultPending(true,token);
        
        var instance = this;
       
        var asynchCallback = function(memberValue) {
            //set the data for the table, along with triggering updates on dependent tables.
            var actionData = {};
            actionData.action = "asynchFormulaData";
            actionData.member = instance;
            actionData.token = token;
            actionData.data = memberValue;
            var actionResponse =  apogee.action.doAction(actionData,false);
        }
        var asynchErrorCallback = function(errorMsg) {
            var actionData = {};
            actionData.action = "updateError";
            actionData.member = instance;
            actionData.token = token;
            actionData.errorMsg = errorMsg;
            var actionResponse =  apogee.action.doAction(actionData,false);
        }

        //call appropriate action when the promise resolves.
        data.then(asynchCallback).catch(asynchErrorCallback);
    }
    else {
        //result is synchronous
        this.setData(data);
    }
}

//------------------------------
// Member Methods
//------------------------------

/** This method extends set data from member. It also
 * freezes the object so it is immutable. (in the future we may
 * consider copying instead, or allowing a choice)*/
apogee.JavascriptTable.prototype.setData = function(data) {
    
	//make this object immutable
	apogee.base.deepFreeze(data);

	//store the new object
    return apogee.Member.setData.call(this,data);
}

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
apogee.JavascriptTable.fromJson = function(owner,json) {
    return new apogee.JavascriptTable(json.name,owner,json.updateData);
}

//============================
// Static methods
//============================

apogee.JavascriptTable.generator = {};
apogee.JavascriptTable.generator.displayName = "Table";
apogee.JavascriptTable.generator.type = "apogee.JavascriptTable";
apogee.JavascriptTable.generator.createMember = apogee.JavascriptTable.fromJson;
apogee.JavascriptTable.generator.setDataOk = true;
apogee.JavascriptTable.generator.setCodeOk = true;

//register this member
apogee.Workspace.addMemberGenerator(apogee.JavascriptTable.generator);;
/** This is a folder. */
apogee.Folder = function(name,owner) {
    //base init
    apogee.Member.init.call(this,name,apogee.Folder.generator);
    apogee.Dependent.init.call(this);
    apogee.ContextHolder.init.call(this);
    apogee.Owner.init.call(this);
    apogee.Parent.init.call(this);
    
    this.initOwner(owner);

    //this holds the base objects, mapped by name
    this.childMap = {};
    this.dataMap = {};
	
	//make sure the data map is frozen
	Object.freeze(this.dataMap);
    this.setData(this.dataMap);
}

//add components to this class
apogee.base.mixin(apogee.Folder,apogee.Member);
apogee.base.mixin(apogee.Folder,apogee.Dependent);                      
apogee.base.mixin(apogee.Folder,apogee.ContextHolder);
apogee.base.mixin(apogee.Folder,apogee.Owner);
apogee.base.mixin(apogee.Folder,apogee.Parent);

//------------------------------
// Parent Methods
//------------------------------

/** this method gets the table map. */
apogee.Folder.prototype.getChildMap = function() {
    return this.childMap;
}

/** This method looks up a child from this folder.  */
apogee.Folder.prototype.lookupChild = function(name) {
    //check look for object in this folder
    return this.childMap[name];
}

/** This method adds a table to the folder. It also sets the folder for the
 *table object to this folder. It will fail if the name already exists.  */
apogee.Folder.prototype.addChild = function(child) {
	
    //check if it exists first
    var name = child.getName();
    if(this.childMap[name]) {
        //already exists! not fatal since it is not added to the model yet,
        throw apogee.base.createError("There is already an object with the given name.",false);
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
}

/** This method removes a table from the folder. */
apogee.Folder.prototype.removeChild = function(child) {
    //make sure this is a child of this object
	var parent = child.getParent();
    if((!parent)||(parent !== this)) return;
	
    //remove from folder
    var name = child.getName();
    delete(this.childMap[name]);
    this.spliceDataMap(name);
    
    //set all children as dependents
    this.calculateDependents();
}

/** This method updates the table data object in the folder data map. */
apogee.Folder.prototype.updateData = function(child) {
	
    var name = child.getName();
    var data = child.getData();
    if(this.childMap[name] === undefined) {
        alert("Error - this table " + name + " has not yet been added to the folder.");
        return;
    }
	this.spliceDataMap(name,data);
}

/** There is no calculation for the folder base on dependents. 
 * @private */
apogee.Folder.prototype.needsCalculating = function() {
    return true;
}

/** Calculate the data.  */
apogee.Folder.prototype.calculate = function() {
    //we don't need to calculate since the calculate is done on the fly
    //we just need to make sure the impactors are set
    this.initializeImpactors();
    
    this.clearCalcPending();
}

//------------------------------
// Dependent Methods
//------------------------------

/** This method updates the dependencies of any children
 * based on an object being added. */
apogee.Folder.prototype.updateDependeciesForModelChange = function(recalculateList) {
    for(var key in this.childMap) {
        var child = this.childMap[key];
        if(child.isDependent) {
            child.updateDependeciesForModelChange(recalculateList);
        }
    }
}

//------------------------------
// Member Methods
//------------------------------

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
apogee.Folder.fromJson = function(owner,json,childrenJsonOutputList) {
    var folder = new apogee.Folder(json.name,owner);
    if(json.childrenNotWriteable) {
        folder.setChildrenWriteable(false);
    }
    
    for(var key in json.children) {
        var childJson = json.children[key];
        childrenJsonOutputList.push(childJson);
    }
    
    return folder;
}

/** This method adds any additional data to the json to save for this member. 
 * @protected */
apogee.Folder.prototype.addToJson = function(json) {
	json.children = {};
    
    if(!this.getChildrenWriteable()) {
        json.childrenNotWriteable = true;
    }
    
    for(var key in this.childMap) {
        var child = this.childMap[key];
        json.children[key] = child.toJson();
    }
}

apogee.Folder.prototype.onClose = function () {
    for(var key in this.childMap) {
        var child = this.childMap[key];
        if(child.onClose) child.onClose();
    }
}

//============================
// Private methods
//============================

/** This method updates the table data object in the folder data map. 
 * @private */
apogee.Folder.prototype.calculateDependents = function() {
    var newDependsOn = [];
    for(var name in this.childMap) {
        var child = this.childMap[name];
        newDependsOn.push(child);
    }
    this.updateDependencies(newDependsOn);
}

/** This method creates a new immutable data map, either adding a give name and data or
 * removing a name. To remove a name from the map, leave "addData" as undefined. 
 * @private */
apogee.Folder.prototype.spliceDataMap = function(addOrRemoveName,addData) {
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
}

//============================
// Static methods
//============================

apogee.Folder.generator = {};
apogee.Folder.generator.displayName = "Folder";
apogee.Folder.generator.type = "apogee.Folder";
apogee.Folder.generator.createMember = apogee.Folder.fromJson;
apogee.Folder.generator.setDataOk = false;
apogee.Folder.generator.setCodeOk = false;

//register this member
apogee.Workspace.addMemberGenerator(apogee.Folder.generator);;
/** This is a folderFunction, which is basically a function
 * that is expanded into data objects. */
apogee.FolderFunction = function(name,owner,initialData,createEmptyInternalFolder) {
    //base init
    apogee.Member.init.call(this,name,apogee.FolderFunction.generator);
    apogee.Dependent.init.call(this);
    apogee.ContextHolder.init.call(this);
    apogee.Owner.init.call(this);
    apogee.RootHolder.init.call(this);
    
    this.initOwner(owner);
    
    //set initial data
    this.argList = initialData.argList !== undefined ? initialData.argList : "";
    this.returnValueString = initialData.returnValue !== undefined ? initialData.returnValue : [];
    //set to an empty function
    this.setData(function(){});
    
    //recreate the root folder if info is specified
    if(createEmptyInternalFolder) {
        var internalFolder = new apogee.Folder(apogee.FolderFunction.INTERNAL_FOLDER_NAME,this);
        this.setRoot(internalFolder);
    }
}

//add components to this class
apogee.base.mixin(apogee.FolderFunction,apogee.Member);
apogee.base.mixin(apogee.FolderFunction,apogee.Dependent);
apogee.base.mixin(apogee.FolderFunction,apogee.ContextHolder);
apogee.base.mixin(apogee.FolderFunction,apogee.Owner);
apogee.base.mixin(apogee.FolderFunction,apogee.RootHolder);

apogee.FolderFunction.INTERNAL_FOLDER_NAME = "root";

/** This gets the internal forlder for the folderFunction. */
apogee.FolderFunction.prototype.getInternalFolder = function() {
    return this.internalFolder;
}

/** Implemnetation of get root for folder function. */
apogee.FolderFunction.prototype.getRoot = function() {
    return this.getInternalFolder();
}

/** This method sets the root object - implemented from RootHolder.  */
apogee.FolderFunction.prototype.setRoot = function(child) {
    this.internalFolder = child;
    var newDependsOn = [];
    if(child) newDependsOn.push(child);
    this.updateDependencies(newDependsOn);
}

/** This gets the name of the return object for the folderFunction function. */
apogee.FolderFunction.prototype.getReturnValueString = function() {
    return this.returnValueString;
}

/** This gets the arg list of the folderFunction function. */
apogee.FolderFunction.prototype.getArgList = function() {
    return this.argList;
}

//------------------------------
// Member Methods
//------------------------------

/** This overrides the get displaymethod of member to return the function declaration. */
apogee.FolderFunction.prototype.getDisplayName = function(useFullPath) {
    var name = useFullPath ? this.getFullName() : this.getName();
    var argList = this.getArgList();
    var argListString = argList.join(",");
    
    var displayName = name + "(" + argListString + ")";
    if((this.returnValueString != null)&&(this.returnValueString.length > 0)) {
        displayName += " = " + this.returnValueString;
    }
    
    return displayName;
}

/** This method removes any data from this workspace on closing. */
apogee.FolderFunction.prototype.close = function() {
    this.internalFolder.onClose();
}

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
apogee.FolderFunction.fromJson = function(owner,json,childrenJsonOutputList) {
    var initialData = {};
    initialData.argList = json.argList;
    initialData.returnValue = json.returnValue;
    
    var createEmptyInternalFolder;
    if(json.internalFolder) {
        //enforce name of internal folder
        //this is needed for importing a workspace as a folder function
        //this will fail quietly if we change the format, but it will still run
        json.internalFolder.name = apogee.FolderFunction.INTERNAL_FOLDER_NAME;
        
        childrenJsonOutputList.push(json.internalFolder);
        createEmptyInternalFolder = false;
    }
    else {
        createEmptyInternalFolder = true;
    }

    
    return new apogee.FolderFunction(json.name,owner,initialData,createEmptyInternalFolder);
}

/** This method adds any additional data to the json saved for this member. 
 * @protected */
apogee.FolderFunction.prototype.addToJson = function(json) {
    json.argList = this.argList;
    json.returnValue = this.returnValueString;
    json.internalFolder = this.internalFolder.toJson();
}

/** This method extends the base method to get the property values
 * for the property editting. */
apogee.FolderFunction.addPropValues = function(member,values) {
    var argList = member.getArgList();
    var argListString = argList.toString();
    values.argListString = argListString;
    values.returnValueString = member.getReturnValueString();
    return values;
}

/** This method executes a property update. */
apogee.FolderFunction.getPropertyUpdateAction = function(folderFunction,oldValues,newValues) {
    if((oldValues.argListString !== newValues.argListString)||(oldValues.returnValueString !== newValues.returnValueString)) {
        var newArgList = apogee.FunctionTable.parseStringArray(newValues.argListString);
  
//I commented this out - I need to check to make sure that was correct        
//        folderFunction.setArgList(newArgList);
//        folderFunction.setReturnValueString(newValues.returnValueString);
        
        var actionData = {};
        actionData.action = "updateFolderFunction";
        actionData.member = folderFunction;
        actionData.argList = newArgList;
        actionData.returnValueString = newValues.returnValueString;
        return actionData;
    }    
    else {
        return null;
    }
}

//-------------------------------
// Dependent Methods
//-------------------------------
    

/** If this is true the member must be executed. */
apogee.FolderFunction.prototype.needsCalculating = function() {
	return true;
}

/** This updates the member data based on the function. It returns
 * true for success and false if there is an error.  */
apogee.FolderFunction.prototype.calculate = function() {  
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
}

/** This method updates the dependencies of any children
 * based on an object being added. */
apogee.FolderFunction.prototype.updateDependeciesForModelChange = function(recalculateList) {
    if(this.internalFolder) {
        this.internalFolder.updateDependeciesForModelChange(recalculateList);
    }
}

//------------------------------
//ContextHolder methods
//------------------------------

/** This method retrieve creates the loaded context manager. */
apogee.FolderFunction.prototype.createContextManager = function() {
    return new apogee.ContextManager(this);
}

//------------------------------
//Parent methods
//------------------------------

/** this method gets the table map. */
apogee.FolderFunction.prototype.getChildMap = function() {
    return this.internalFolder.childMap;
}

/** This method looks up a child from this folder.  */
apogee.FolderFunction.prototype.lookupChild = function(name) {
    //check look for object in this folder
    return this.internalFolder.childMap[name];
}

//------------------------------
//Owner methods
//------------------------------

/** this method gets the hame the children inherit for the full name. */
apogee.FolderFunction.prototype.getPossesionNameBase = function() {
    return this.getFullName() + ".";
}

/** This method looks up a member by its full name. */
apogee.FolderFunction.prototype.getMemberByPathArray = function(path,startElement) {
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
}


//==============================
// Private Methods
//==============================

/** This is called from the update action. It should not be called externally. */
apogee.FolderFunction.prototype.setReturnValueString = function(returnValueString) {
    this.returnValueString = returnValueString;
}

/** This is called from the update action. It should not be called externally. */
apogee.FolderFunction.prototype.setArgList = function(argList) {
    this.argList = argList;
}

/** This method creates the folderFunction function. It is called from the update action 
 * and should not be called externally. 
 * @private */
apogee.FolderFunction.prototype.getFolderFunctionFunction = function(folderFunctionErrors) {

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
            entry.member = inputElementArray[i];
            entry.data = arguments[i];
            updateActionList.push(entry);
        }
        
        var actionData = {};
        actionData.action = "compoundAction";
        actionData.actions = updateActionList;
        actionData.workspace = virtualWorkspace;

        //apply the update
        var actionResponse = apogee.action.doAction(actionData,false);        
        if(actionResponse.getSuccess()) {
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
        else {
            //error exectuing folderFunction function - thro wan exception
            throw apogee.base.createError(actionResponse.getErrorMsg());
        }
    }
    
    return folderFunctionFunction;    
}

/** This method creates a copy of the workspace to be used for the function evvaluation. 
 * @private */
apogee.FolderFunction.prototype.createVirtualWorkspace = function(folderFunctionErrors) {
    try {
		return apogee.Workspace.createVirtualWorkpaceFromFolder(this.getName(),this.internalFolder,this.getOwner());
	}
	catch(error) {
        var actionError = apogee.ActionError.processException(exception,"FolderFunction - Code",false);
		folderFunctionErrors.push(actionError);
		return null;
	}
}

/** This method loads the input argument members from the virtual workspace. 
 * @private */
apogee.FolderFunction.prototype.loadInputElements = function(rootFolder,folderFunctionErrors) {
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
//            var actionError = new apogee.ActionError(msg,"FolderFunction - Code",this);
//            folderFunctionErrors.push(actionError);
//        }       
    }
    return argMembers;
}

/** This method loads the output member from the virtual workspace. 
 * @private  */
apogee.FolderFunction.prototype.loadOutputElement = function(rootFolder,folderFunctionErrors) {
    var returnValueMember = rootFolder.lookupChild(this.returnValueString);
//    if(!returnValueMember) {
//        //missing input element
//        var msg = "Return element not found in folderFunction: " + this.returnValueString;
//        var actionError = new apogee.ActionError(msg,"FolderFunction - Code",this);
//        folderFunctionErrors.push(actionError);
//    }
    return returnValueMember;
}

        
//============================
// Static methods
//============================

apogee.FolderFunction.generator = {};
apogee.FolderFunction.generator.displayName = "Folder Function";
apogee.FolderFunction.generator.type = "apogee.FolderFunction";
apogee.FolderFunction.generator.createMember = apogee.FolderFunction.fromJson;
apogee.FolderFunction.generator.addPropFunction = apogee.FolderFunction.addPropValues;
apogee.FolderFunction.generator.getPropertyUpdateAction = apogee.FolderFunction.getPropertyUpdateAction;
apogee.FolderFunction.generator.setDataOk = false;
apogee.FolderFunction.generator.setCodeOk = false;

//register this member
apogee.Workspace.addMemberGenerator(apogee.FolderFunction.generator);


;
/** This class encapsulatees a table with no specific functionality. It
 * is intended to be used as a placeholder when a table generator is not found. */
apogee.ErrorTable = function(name,owner,completeJson) {
    //base init
    apogee.Member.init.call(this,name,apogee.ErrorTable.generator);
    //i didn't really want this to be a dependent, bot for now I think they all have to be - check into this.
    //there are at least two places
    //- add to recalc list function in action (which I temporarily fixed)
    //- initialize impactors in dependent, assumes all impactors are dependents (this is also needed 
    apogee.Dependent.init.call(this);
    
    this.initOwner(owner);
    
    //store this to use during save later
    this.completeJson = completeJson;

    var dummyData = "";
    apogee.updatemember.applyData(this,dummyData);
}

//add components to this class
apogee.base.mixin(apogee.ErrorTable,apogee.Member);
//apogee.base.mixin(apogee.ErrorTable,apogee.Dependent);

//------------------------------
// Member Methods
//------------------------------

/** This method extends set data from member. It also
 * freezes the object so it is immutable. (in the future we may
 * consider copying instead, or allowing a choice)*/
apogee.ErrorTable.prototype.setData = function(data) {
    
	//make this object immutable
	apogee.base.deepFreeze(data);

	//store the new object
    return apogee.Member.setData.call(this,data);
}

/** This overrides the commplete json to just pass back the entire json sent in. */
apogee.ErrorTable.prototype.toJson = function() {
    return this.completeJson;
}

/** This method creates a member from a json. It should be implemented as a static
 * method in a non-abstract class. */ 
apogee.ErrorTable.fromJson = function(owner,json) {
    //note - we send in the complete JSON so we can return is on saving
    return new apogee.ErrorTable(json.name,owner,json);
}

//------------------------------
// Dependent Methods
//------------------------------

/** This method udpates the dependencies if needed because
 *a variable was added or removed from the workspace.  */
apogee.ErrorTable.prototype.updateDependeciesForModelChange = function(object) {
    //no action
}

/** This is a check to see if the object should be checked for dependencies 
 * for recalculation. It is safe for this method to always return false and
 allow the calculation to happen. 
 * @private */
apogee.ErrorTable.prototype.needsCalculating = function() {
    return false;
}

/** This method udpates the dependencies if needed because
 *the passed variable was added.  */
apogee.ErrorTable.prototype.updateDependeciesForModelChange = function(recalculateList) {
    //no action
}
//============================
// Static methods
//============================

apogee.ErrorTable.generator = {};
apogee.ErrorTable.generator.displayName = "Table";
apogee.ErrorTable.generator.type = "apogee.ErrorTable";
apogee.ErrorTable.generator.createMember = apogee.ErrorTable.fromJson;
apogee.ErrorTable.generator.setDataOk = false;

//register this member
apogee.Workspace.addMemberGenerator(apogee.ErrorTable.generator);;
/**
 * Action Namespace
 * An action is an operation on the data model. The code in this namespace handles
 * the generic parts of the action process, and the action specific code is placed
 * elsewhere.
 * 
 * Generic Action:
 * - The action is represented by a data object "actionData". 
 * - The method apogee.action.doAction is called to exectue the action.
 * - Available actions are registered through the method apogee.action.addActionInfo.
 *   this allows the doAction method to dispatch the actionData to the proper
 *   action specific code.
 * - After the action specific code is completed, generic code runs to ensure eny
 *   remote tables that need to be updated do get updated, and that the proper
 *   events are fired.
 *   
 * Registering a specific action:
 * To register a specific action, apogee.action.addActionInfo must be called with 
 * a actionInfo object. An action info object is of the following format.
 * actionInfo object: {
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
 *   "error": (output only - An action error giving an error in action specific code execution)
 *   "actionInfo": (This is the action info for the action. It is added within doAction and should not be added the user.)
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
apogee.action = {};

/** This structure holds the processing information for all the actions. It is set by each action. 
 * @private */
apogee.action.actionInfo = {
}

/** This method is used to execute an action for the data model.
 * -The source tells the type of action. This affects how the action is treated. For 
 * example, actions from the UI set the workspace dirty flag to true and are used in the
 * undo list. (NOTE - UNDO LIST DOES NOT EXIST YET)
 * -The optionalContext is a context manager to convert a member name to a
 * member, if supported by the action.
 * -The optionalActionResponse allows you to pass an existing actionResponse rather
 * than creating a new one inside this function as a return value. */
apogee.action.doAction = function(actionData,addToUndo,optionalContext,optionalActionResponse) {
    
    //read the workspace
    var workspace;
    if(actionData.member) {
        workspace = actionData.member.getWorkspace();
    }
    else if(actionData.workspace) {
        workspace = actionData.workspace;
    }
    else {
        throw new Error("Workspace info missing from action. ");
    }
    
    //only allow one action at a time
    if(workspace.isActionInProgress()) {
        var queuedAction = {};
        queuedAction.actionData = actionData;
        queuedAction.optionalContext = optionalContext;
        queuedAction.optionalActionResponse = optionalActionResponse;
        queuedAction.addToUndo = addToUndo;
        workspace.queueAction(queuedAction);
        
        //return an empty (successful) action response
        //we sould have a flag saying the action is pending
        return new apogee.ActionResponse();;
    }
    
    //flag action in progress
    workspace.setActionInProgress(true);
    
    var actionResponse = optionalActionResponse ? optionalActionResponse : new apogee.ActionResponse();
    
    try {   
        
        var processedActions = [];
        
        //do the action
        apogee.action.callActionFunction(actionData,optionalContext,processedActions); 
        
        //finish processing the action
        var recalculateList = [];
        
        //handle cases with a valid object 
        apogee.action.updateDependencies(workspace,processedActions,recalculateList);
        
        apogee.action.updateRecalculateList(processedActions,recalculateList);
        
        apogee.calculation.callRecalculateList(recalculateList,actionResponse);
    
        //fire events
        apogee.action.fireEvents(workspace,processedActions,recalculateList);
        
        //save the action for the undo queue if needed
        //WE HAVE NOT UNDO QUEUE NOT. But do set the workspace dirty flag, which 
        //we use to warn the user if there is unsaved data.
        //NOTE - I might not want to do that is the action fails - check into this
        if(addToUndo) {
            workspace.setIsDirty();
        }
	}
	catch(error) {
        //unknown application error
        var actionError = apogee.ActionError.processException(error,apogee.ActionError.ERROR_TYPE_APP,true);
        actionResponse.addError(actionError);
    }
    
    //flag action in progress
    workspace.setActionInProgress(false);
    
    //trigger any pending actions
    var queuedActionData = workspace.getQueuedAction();
    if(queuedActionData) {
        apogee.action.asynchRunQueuedAction(queuedActionData);
    }
    
    //return response
	return actionResponse;
}

/** This function is used to register an action. */
apogee.action.addActionInfo = function(actionName,actionInfo) {
    apogee.action.actionInfo[actionName] = actionInfo;
}

/** This function looks up the proper function for an action and executes it. */
apogee.action.callActionFunction = function(actionData,context,processedActions) {

    //do the action
    var actionInfo = apogee.action.actionInfo[actionData.action];
    if(actionInfo) {
        actionData.actionInfo = actionInfo;
        actionInfo.actionFunction(actionData,context,processedActions);
    }
    else {
        actionData.error = new apogee.ActionError("Unknown action: " + actionData.action,apogee.ActionError.ERROR_TYPE_APP,null);
    }  
}

/** This method returns a random numberic token that is used in asynch updates.
 * It serves two purposes, first to ensure only the _latest_ asyhc update is 
 * done. Secondly it prevents someone arbitrarily using this method 
 * without initially setting the pending flag.
 */
apogee.action.getAsynchToken = function() {
    return Math.random();
}

/** This token value should be used if a table is pending because it is waiting for
 * an update in another table. */
apogee.action.DEPENDENT_PENDING_TOKEN = -1;

//--------------------------------
// Action Convenience Methods
//--------------------------------

/** This is a convenience method to set a member to a given value. */
apogee.action.dataUpdate = function(updateMemberName,fromMember,data,addToUndo) {
    var workspace = fromMember.getWorkspace();
    var contextManager = fromMember.getContextManager();
    
    //set the data for the table, along with triggering updates on dependent tables.
    var actionData = {};
    actionData.action = "updateData";
    actionData.memberName = updateMemberName;
    actionData.workspace = workspace;
    actionData.data = data;
    return apogee.action.doAction(actionData,addToUndo,contextManager);
}

/** This is a convenience method to set a member to a given value. */
apogee.action.compoundDataUpdate = function(updateInfo,fromMember,addToUndo) {
    var workspace = fromMember.getWorkspace();
    var contextManager = fromMember.getContextManager();

    //create the single compound action
    var actionData = {};
    actionData.action = apogee.compoundaction.ACTION_NAME;
    actionData.actions = apogee.action.updateInfoToActionList(updateInfo,workspace);
    actionData.workspace = workspace;

    return apogee.action.doAction(actionData,addToUndo,contextManager);
}


/** This is a convenience method to set a member tohave an error message. */
apogee.action.errorUpdate = function(updateMemberName,fromMember,errorMessage,addToUndo) {
    var workspace = fromMember.getWorkspace();
    var contextManager = fromMember.getContextManager();
        
    var actionData = {};
    actionData.action = "updateError";
    actionData.memberName = updateMemberName;
    actionData.workspace = workspace;
    actionData.errorMsg = errorMessage;
    return apogee.action.doAction(actionData,addToUndo,contextManager);
}

/** This is a convenience method to set a member to a given value when the dataPromise resolves. */
apogee.action.asynchDataUpdate = function(updateMemberName,fromMember,dataPromise,addToUndo) {
    
    var workspace = fromMember.getWorkspace();
    var contextManager = fromMember.getContextManager();
    
    var token = apogee.action.getAsynchToken();
        
    var actionData = {};
    actionData.action = "updateDataPending";
    actionData.memberName = updateMemberName;
    actionData.workspace = workspace;
    actionData.token = token;
    var actionResponse =  apogee.action.doAction(actionData,addToUndo,contextManager);
    
    var asynchCallback = function(memberValue) {
        //set the data for the table, along with triggering updates on dependent tables.
        var actionData = {};
        actionData.action = "updateData";
        actionData.memberName = updateMemberName;
        actionData.workspace = workspace;
        actionData.token = token;
        actionData.data = memberValue;
        var actionResponse =  apogee.action.doAction(actionData,addToUndo,contextManager);
    }
    var asynchErrorCallback = function(errorMsg) {
        var actionData = {};
        actionData.action = "updateError";
        actionData.memberName = updateMemberName;
        actionData.workspace = workspace;
        actionData.token = token;
        actionData.errorMsg = errorMsg;
        var actionResponse =  apogee.action.doAction(actionData,addToUndo,contextManager);
    }

    //call appropriate action when the promise resolves.
    dataPromise.then(asynchCallback).catch(asynchErrorCallback);
}

/** This is a convenience method to set a member to a given value. 
 * @private */
apogee.action.updateInfoToActionList = function(updateInfo,workspace) {

    //make the action list
    var actionList = [];
    for(var i = 0; i < updateInfo.length; i++) {
        var updateEntry = updateInfo[i];
        var subActionData = {};
        subActionData.action = "updateData";
        subActionData.memberName = updateEntry[0];
        subActionData.workspace = workspace;
        subActionData.data = updateEntry[1];
        actionList.push(subActionData);
    }
    
    return actionList;
}



//=======================================
// Internal Methods
//=======================================

/** This function triggers the action for the queued action to be run when the current thread exits. */
apogee.action.asynchRunQueuedAction = function(queuedActionData) {
    var callback = function() {
        apogee.action.doAction(queuedActionData.actionData,
            queuedActionData.addToUndo,
            queuedActionData.optionalContext,
            queuedActionData.optionalActionResponse);
    }
    
    setTimeout(callback,0);
}

/** This method makes sure the member dependencies in the workspace are properly updated. 
 * @private */
apogee.action.updateDependencies = function(workspace,processedActions,recalculateList) {
    //check if we need to update the entire model
    var updateAllDep = apogee.action.checkUpdateAllDep(processedActions);
    if(updateAllDep) {
        //update entire model - see conditions bewlo
        workspace.updateDependeciesForModelChange(recalculateList);
    }
    else {
        //upate dependencies on table with updated code
        for(var i = 0; i < processedActions.length; i++) {
            var actionData = processedActions[i];
            if(apogee.action.doInitializeDependencies(actionData)) {
                actionData.member.initializeDependencies();
            }
        }
    }
}
    
/** This function updates the recalculation list for the given processed actions. 
 * @private */
apogee.action.updateRecalculateList = function(processedActions,recalculateList) {
    for(var i = 0; i < processedActions.length; i++) {
        var actionData = processedActions[i];
        if(apogee.action.doAddToRecalc(actionData)) {
            apogee.calculation.addToRecalculateList(recalculateList,actionData.member);            
        }
        else if((apogee.action.doAddDependOnToRecalc(actionData))) {
            apogee.calculation.addDependsOnToRecalculateList(recalculateList,actionData.member);                         
        }
    }
}
    
/** This function fires the proper events for the action. 
 * @private */
apogee.action.fireEvents = function(workspace,processedActions,recalculateList) {
    
    //TEMPORARY EVENT PROCESSING - NEEDS TO BE IMPROVED
    var eventSet = {};
    var member;
    
    for(var i = 0; i < processedActions.length; i++) {
        var actionData = processedActions[i];
        
        if(actionData.actionInfo) {
            var eventName = actionData.actionInfo.event;
            if(!eventName) continue;
            
            var member = actionData.member;
      
            apogee.action.fireEvent(workspace,eventName,member);

            //temporary processing!
            if(member) {
                eventSet[actionData.member.getId()] = true;
            }
        }
    }
    
    //Doh! WE NEED TO DO THIS DIFFERENTLY FOR LOTS OF REASONS
    for(i = 0; i < recalculateList.length; i++) {
        var member = recalculateList[i];
        if(!eventSet[member.getId()]) {
            apogee.action.fireEvent(workspace,apogee.updatemember.MEMBER_UPDATED_EVENT,member);
        }
    } 
}

/** This is a helper function to dispatch an event. */
apogee.action.fireEvent = function(workspace,name,data) {
    workspace.dispatchEvent(name,data);
}

/** This method determines if updating all dependencies is necessary. */
apogee.action.checkUpdateAllDep = function(processedActions) {
    for(var i = 0; i < processedActions.length; i++) {
        var actionData = processedActions[i];
        var member = actionData.member;
        //check update only needed for data holders (no impact for non-data holder
        if(member) {
            if((actionData.actionInfo)&&(actionData.actionInfo.checkUpdateAll)){
                return true;
            }
        }
    }
    return false;
}

/** This method if a single action entry requires updating dependencies for the associated member. */
apogee.action.doInitializeDependencies = function(actionData) {
    if(!actionData.member) return false;
    
    //only applicable to codeables
    if((actionData.actionInfo)&&(actionData.member.isCodeable)) {
        return actionData.actionInfo.updateDependencies;
    }
    else {
        return false;
    }
}

/** This method checks if the associated member and its dependencies need to be added to the recalc list. */
apogee.action.doAddToRecalc = function(actionData) {
    if(!actionData.member) return false;
    if(!actionData.member.isDependent) return false;
    
    if(actionData.actionInfo) {
        return actionData.actionInfo.addToRecalc;
    }
    else {
        return false;
    }
}

/** This method checks if the dependencies of the associated needs to be added to the recalc list, but not the member itself. */
apogee.action.doAddDependOnToRecalc = function(actionData) {
    if(actionData.actionInfo) {
        return actionData.actionInfo.addDependenceiesToRecalc;
    }
    else {
        return false;
    }
}


;
/** This namespace contains the compound action */
apogee.compoundaction = {};

/** Compound action name 
 * Action Data format:
 * {
 *  "action": apogee.compoundaction.ACTION_NAME,
 *  "workspace":the workspace object
 *  "actions": (list of actions in this compound action),
 * }
 */
apogee.compoundaction.ACTION_NAME = "compoundAction";

/** This method is the action function for a compound action. */
apogee.compoundaction.compoundActionFunction = function(actionData,optionalContext,processedActions) {

    var actionList = actionData.actions;
    for(var i = 0; i < actionList.length; i++) {
        var childActionData = actionList[i];
        apogee.action.callActionFunction(childActionData,optionalContext,processedActions);
    }
}

/** Action info */
apogee.compoundaction.ACTION_INFO = {
    "actionFunction": apogee.compoundaction.compoundActionFunction,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": false,
    "event": null
}


//This line of code registers the action 
apogee.action.addActionInfo(apogee.compoundaction.ACTION_NAME,apogee.compoundaction.ACTION_INFO);;
/** This namespace contains the create member action */
apogee.createmember = {};

/** Create member action name 
 * Action Data format:
 * {
 *  "action": apogee.createmember.ACTION_NAME,
 *  "owner": (parent/owner for new member),
 *  "name": (name of the new member),
 *  "createData": 
 *      - name
 *      - unique table type name
 *      - additional table specific data
 *  
 *  "member": (OUTPUT - the created member),
 *  "error": (OUTPUT - an error created in the action function)
 * }
 */
apogee.createmember.ACTION_NAME = "createMember";

/** member CREATED EVENT
 * Event member format:
 * {
 *  "member": (member)
 * }
 */
apogee.createmember.MEMBER_CREATED_EVENT = "memberCreated";

/** This method instantiates a member, without setting the update data. 
 *@private */
apogee.createmember.createMember = function(actionData,optionalContext,processedActions) {
    
    //create member
    var generator = apogee.Workspace.getMemberGenerator(actionData.createData.type);

    if(generator) {
        var childJsonOutputList = [];
        var member = generator.createMember(actionData.owner,actionData.createData,childJsonOutputList);

        //store the created object
        actionData.member = member;

        //we are potentially adding multiple creates here, including children
        processedActions.push(actionData);

        //instantiate children if there are any
        for(var i = 0; i < childJsonOutputList.length; i++) {
            var childActionData = {};
            childActionData.action = "createMember";
            childActionData.actionInfo = apogee.createmember.ACTION_INFO;
            childActionData.owner = member;
            childActionData.createData = childJsonOutputList[i];
            apogee.createmember.createMember(childActionData,optionalContext,processedActions);
        }
    }
    else {
        //type not found! - create a dummy object
        member = apogee.ErrorTable.generator.createMember(actionData.owner,actionData.createData);
        var error = new apogee.ActionError("Member type not found: " + actionData.createData.type,apogee.ActionError.ERROR_TYPE_APP,null);
        member.addError(error);
        
        actionData.member = member;
        actionData.error = error;
        processedActions.push(actionData);
    }
    
    return member;
}

/** Action info */
apogee.createmember.ACTION_INFO = {
    "actionFunction": apogee.createmember.createMember,
    "checkUpdateAll": true,
    "updateDependencies": true,
    "addToRecalc": true,
    "event": apogee.createmember.MEMBER_CREATED_EVENT
}

//This line of code registers the action 
apogee.action.addActionInfo(apogee.createmember.ACTION_NAME,apogee.createmember.ACTION_INFO);;
/** This namespace contains the update member actions */
apogee.updateworkspace = {};

/** Update workspace action name 
 * Action Data format:
 * {
 *  "action": apogee.updateworkspace.UPDATE_WORKSPACE_ACTION_NAME,
 *  "workspace": (workspace to update),
 *  "name": (new name)
 * }
 */
apogee.updateworkspace.UPDATE_WORKSPACE_ACTION_NAME = "updateWorkspace";


/** member UPDATED EVENT
 * Event member format:
 * {
 *  "member": (member)
 * }
 */
apogee.updateworkspace.WORKSPACE_UPDATED_EVENT = "workspaceUpdated";

/** Update code action function. */
apogee.updateworkspace.updateWorkspace = function(actionData,optionalContext,processedActions) { 
    
    actionData.workspace.setName(actionData.name);
        
    processedActions.push(actionData);
}

/** Update data action info */
apogee.updateworkspace.UPDATE_WORKSPACE_ACTION_INFO = {
    "actionFunction": apogee.updateworkspace.updateWorkspace,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": false,
    "addDependenceiesToRecalc": false,
    "event": apogee.updateworkspace.WORKSPACE_UPDATED_EVENT
};

//The following code registers the actions
apogee.action.addActionInfo(apogee.updateworkspace.UPDATE_WORKSPACE_ACTION_NAME,apogee.updateworkspace.UPDATE_WORKSPACE_ACTION_INFO);;
/** This namespace contains the update member actions */
apogee.updatemember = {};

/** Update data action name 
 * Action Data format:
 * {
 *  "action": apogee.updatemember.UPDATE_DATA_ACTION_NAME,
 *  "member": (member to update),
 *  "data": (new value for the table)
 * }
 */
apogee.updatemember.UPDATE_DATA_ACTION_NAME = "updateData";

/** Update code action name 
 * Action Data format:
 * {
 *  "action": apogee.updatemember.UPDATE_CODE_ACTION_NAME,
 *  "member": (member to update),
 *  "argList": (arg list for the table)
 *  "functionBody": (function body for the table)
 *  "supplementalCode": (supplemental code for the table)
 * }
 */
apogee.updatemember.UPDATE_CODE_ACTION_NAME = "updateCode";

/** Update data pending action name 
 * Action Data format:
 * {
 *  "action": apogee.updatemember.UPDATE_DATA_PENDING_ACTION_NAME,
 *  "member": (member to update),
 * }
 */
apogee.updatemember.UPDATE_DATA_PENDING_ACTION_NAME = "updateDataPending"

/** Update asynch data action name - used for updating data after an asynchronous formula
 * Action Data format:
 * {
 *  "action": apogee.updatemember.UPDATE_ASYNCH_DATA_ACTION_NAME,
 *  "member": (member to update),
 *  "data": (new value for the table)
 * }
 */
apogee.updatemember.UPDATE_ASYNCH_DATA_ACTION_NAME = "asynchFormulaData";

/** Update asynch error action name - used for publishing an error after an asynchronous formula
 * Action Data format:
 * {
 *  "action": apogee.updatemember.UPDATE_DATA_ACTION_NAME,
 *  "member": (member to update),
 *  "errorMsg": (new value for the table)
 * }
 */
apogee.updatemember.UPDATE_ASYNCH_ERROR_ACTION_NAME = "updateError";

/** Update description action name - used for publishing an error after an asynchronous formula
 * Action Data format:
 * {
 *  "action": apogee.updatemember.UPDATE_DESCRIPTION_ACTION_NAME,
 *  "member": (member to update),
 *  "description": (description)
 * }
 */
apogee.updatemember.UPDATE_DESCRIPTION_ACTION_NAME = "updateDescription";

/** member UPDATED EVENT
 * Event member format:
 * {
 *  "member": (member)
 * }
 */
apogee.updatemember.MEMBER_UPDATED_EVENT = "memberUpdated";

/** Update code action function. */
apogee.updatemember.updateCode = function(actionData,optionalContext,processedActions) { 
    
    var member = actionData.member;
    if((!member.isCodeable)||(!member.getSetCodeOk())) {
        throw new Error("can not set code on member: " + member.getFullName());
    }
          
    apogee.updatemember.applyCode(actionData.member,
        actionData.argList,
        actionData.functionBody,
        actionData.supplementalCode);
        
    processedActions.push(actionData);
}

/** Update data action function */
apogee.updatemember.updateData = function(actionData,optionalContext,processedActions) {
    
    if(!actionData.member) {
        apogee.updatemember.loadMemberName(actionData,optionalContext);
    }
    
    if(!actionData.member.getSetDataOk()) {
        throw new Error("can not set data on member: " + member.getFullName());
    }
        
    var member = actionData.member;

    apogee.updatemember.applyData(member,actionData.data);

    //clear the code - so the data is used
    if(member.isCodeable) {
        member.clearCode();
    }
    
    processedActions.push(actionData);
}

/** Update asynch data action function */
apogee.updatemember.updateDataPending = function(actionData,optionalContext,processedActions) {
    
    if(!actionData.member) {
        apogee.updatemember.loadMemberName(actionData,optionalContext);
    }
	
    var member = actionData.member;
    var token = actionData.token;
    
    member.setResultPending(true,token);
    
    processedActions.push(actionData);
}

/** Asynch function update data action function (resulting from code) */
apogee.updatemember.asynchFunctionUpdateData = function(actionData,optionalContext,processedActions) {
    
    if(!actionData.member.getSetCodeOk()) {
        throw new Error("can not set code on member: " + member.getFullName());
    }
        
    var member = actionData.member;
    var token = actionData.token;

    if(member.pendingTokenMatches(token)) {
        //apply the data but DO NOT clear the code (this is an asymch update to a coded member)
        apogee.updatemember.applyData(member,actionData.data);
        member.setResultPending(false);

        processedActions.push(actionData);
    }
}

/** Update asynch error action function. */
apogee.updatemember.asynchFunctionUpdateError = function(actionData,optionalContext,processedActions) {
    
    if(!actionData.member) {
        apogee.updatemember.loadMemberName(actionData,optionalContext);
    }

    var member = actionData.member;
    var token = actionData.token;
    
    if(member.pendingTokenMatches(token)) {
        //set the error flag
        var actionError = new apogee.ActionError(actionData.errorMsg,"Codeable - Calculate",member);
        member.addError(actionError);
        member.setResultPending(false);

        processedActions.push(actionData);
    }
        
}

/** Update description */
apogee.updatemember.updateDescription = function(actionData,optionalContext,processedActions) {
        
    var member = actionData.member;

    member.setDescription(actionData.description);
    
    processedActions.push(actionData);
}


/** This method updates the code and object function in a member based on the
 * passed code.*/
apogee.updatemember.applyCode = function(codeable,argList,functionBody,supplementalCode) {
    
    var codeInfo ={};
    codeInfo.argList = argList;
    codeInfo.functionBody = functionBody;
    codeInfo.supplementalCode = supplementalCode;
    
    //load some needed context variables
    var codeLabel = codeable.getFullName();
    
    //process the code text into javascript code
    var compiledInfo = apogee.codeCompiler.processCode(codeInfo,
        codeLabel);

    //save the code
    codeable.setCodeInfo(codeInfo,compiledInfo);
}

/** This method sets the data for a member. */
apogee.updatemember.applyData = function(member,data) {
    member.clearErrors();
    member.setData(data);
}

/** Update code action function. */
apogee.updatemember.loadMemberName = function(actionData,context) { 
    
    if(actionData.memberName) {
        var path = actionData.memberName.split(".");
        actionData.member = context.getImpactor(path);
    }
    if(!actionData.member) {
        throw new Error("Member not found for action: " + actionData.action);
    }
}


/** Update data action info */
apogee.updatemember.UPDATE_DATA_ACTION_INFO = {
    "actionFunction": apogee.updatemember.updateData,
    "checkUpdateAll": false,
    "updateDependencies": true,
    "addToRecalc": false,
    "addDependenceiesToRecalc": true,
    "event": apogee.updatemember.MEMBER_UPDATED_EVENT
};
/** Update code action info */
apogee.updatemember.UPDATE_CODE_ACTION_INFO = {
    "actionFunction": apogee.updatemember.updateCode,
    "checkUpdateAll": false,
    "updateDependencies": true,
    "addToRecalc": true,
    "event": apogee.updatemember.MEMBER_UPDATED_EVENT
};
apogee.updatemember.UPDATE_DATA_PENDING_ACTION_INFO = {
    "actionFunction": apogee.updatemember.updateDataPending,
    "checkUpdateAll": false,
    "updateDependencies": true,
    "addToRecalc": false,
    "addDependenceiesToRecalc": true,
    "event": apogee.updatemember.MEMBER_UPDATED_EVENT
};
/** Update asynch data action info */
apogee.updatemember.UPDATE_ASYNCH_DATA_ACTION_INFO = {
    "actionFunction": apogee.updatemember.asynchFunctionUpdateData,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": false,
    "addDependenceiesToRecalc": true,
    "event": apogee.updatemember.MEMBER_UPDATED_EVENT
};
/** Update asynch error action info */
apogee.updatemember.UPDATE_ASYNCH_ERROR_ACTION_INFO = {
    "actionFunction": apogee.updatemember.asynchFunctionUpdateError,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": false,
    "addDependenceiesToRecalc": true,
    "event": apogee.updatemember.MEMBER_UPDATED_EVENT
};
/** Update data action info */
apogee.updatemember.UPDATE_DESCRIPTION_ACTION_INFO = {
    "actionFunction": apogee.updatemember.updateDescription,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": false,
    "addDependenceiesToRecalc": false,
    "event": apogee.updatemember.MEMBER_UPDATED_EVENT
};


//The following code registers the actions
apogee.action.addActionInfo(apogee.updatemember.UPDATE_DATA_ACTION_NAME,apogee.updatemember.UPDATE_DATA_ACTION_INFO);
apogee.action.addActionInfo(apogee.updatemember.UPDATE_CODE_ACTION_NAME,apogee.updatemember.UPDATE_CODE_ACTION_INFO);
apogee.action.addActionInfo(apogee.updatemember.UPDATE_DATA_PENDING_ACTION_NAME,apogee.updatemember.UPDATE_DATA_PENDING_ACTION_INFO);
apogee.action.addActionInfo(apogee.updatemember.UPDATE_ASYNCH_DATA_ACTION_NAME,apogee.updatemember.UPDATE_ASYNCH_DATA_ACTION_INFO);
apogee.action.addActionInfo(apogee.updatemember.UPDATE_ASYNCH_ERROR_ACTION_NAME,apogee.updatemember.UPDATE_ASYNCH_ERROR_ACTION_INFO);
apogee.action.addActionInfo(apogee.updatemember.UPDATE_DESCRIPTION_ACTION_NAME,apogee.updatemember.UPDATE_DESCRIPTION_ACTION_INFO);;
/** This namespace contains the move member action */
apogee.movemember = {};

/** Move member action name 
 * Action Data format:
 * {
 *  "action": apogee.movemember.ACTION_NAME,
 *  "member": (member to move),
 *  
 *  "eventInfo": (OUTPUT - event info for the associated delete event)
 * }
 */
apogee.movemember.ACTION_NAME = "moveMember";

/** Move member action function */
apogee.movemember.moveMember = function(actionData,optionalContext,processedActions) {
        
    var member = actionData.member;
        
    var movedMemberList = [];
    apogee.movemember.loadMovedList(member,movedMemberList);
    member.move(actionData.name,actionData.owner);
    
    //add the individual moves
    for(var i = 0; i < movedMemberList.length; i++) {
        var moveMember = movedMemberList[i];
        
        //we are adding multiple delete events here
        var actionDataEntry;
        if(moveMember === member) {
            actionDataEntry = actionData;
        }
        else {
            actionDataEntry = {};
            actionDataEntry.action = "moveMember";
            actionDataEntry.member = member;
            actionDataEntry.name = member.getName();
            actionDataEntry.owner = member.getOwner();
            actionDataEntry.actionInfo = actionData.actionInfo;
        }
        
        processedActions.push(actionDataEntry);
    }

}

/** this creates the moved info list, including the member and the old name, but not the new name
 * @private */
apogee.movemember.loadMovedList = function(member,movedMemberList) {
    movedMemberList.push(member);
    
    if(member.isParent) {
        var childMap = member.getChildMap();
        for(var key in childMap) {
            var child = childMap[key];
            apogee.movemember.loadMovedList(child,movedMemberList);
        }
    }
    else if(member.isRootHolder) {
        var root = member.getRoot();
        apogee.movemember.loadMovedList(root,movedMemberList);
    }
}

/** Action info */
apogee.movemember.ACTION_INFO= {
    "actionFunction": apogee.movemember.moveMember,
    "checkUpdateAll": true,
    "updateDependencies": true,
    "addToRecalc": true,
    "event": apogee.updatemember.MEMBER_UPDATED_EVENT
};


//This line of code registers the action 
apogee.action.addActionInfo(apogee.movemember.ACTION_NAME,apogee.movemember.ACTION_INFO);;
/** This namespace contains the delete member action */
apogee.deletemember = {};

/** Delete member action name 
 * Action Data format:
 * {
 *  "action": apogee.deletemember.ACTION_NAME,
 *  "member": (member to delete),
 *  
 *  "eventInfo": (OUTPUT - event info for the associated delete event)
 * }
 */
apogee.deletemember.ACTION_NAME = "deleteMember";

/** MEMBER DELETED EVENT
 * Event object Format:
 * {
 *  "member": (member),
 *  }
 */
apogee.deletemember.MEMBER_DELETED_EVENT = "memberDeleted";

/** Delete member action function */
apogee.deletemember.deleteMember = function(actionData,optionalContext,processedActions) {

    var deleteList = [];

    apogee.deletemember.getDeleteList(actionData.member,deleteList);
    for(var i = 0; i < deleteList.length; i++) {
        //call delete handlers
        var member = deleteList[i];
        member.onDeleteMember();
        if(member.isDependent) {
            member.onDeleteDependent();
        }   
        
        //we are adding multiple delete events here
        var actionDataEntry;
        if(member == actionData.member) {
            actionDataEntry = actionData;
        }
        else {
            actionDataEntry = {};
            actionDataEntry.action = "deleteMember";
            actionDataEntry.member = member;
            actionDataEntry.actionInfo = actionData.actionInfo;
        }
        
        processedActions.push(actionDataEntry);
    }
}

/** @private */
apogee.deletemember.getDeleteList =  function(member,deleteList) {
    //delete children first if there are any
    if(member.isParent) {
        var childMap = member.getChildMap();
        for(var key in childMap) {
            var child = childMap[key];
            apogee.deletemember.getDeleteList(child,deleteList);
        }
    }
    else if(member.isRootHolder) {
        var root = member.getRoot();
        apogee.deletemember.getDeleteList(root,deleteList);
    }
    //delete the member
    deleteList.push(member);
}



/** Action info */
apogee.deletemember.ACTION_INFO = {
    "actionFunction": apogee.deletemember.deleteMember,
    "checkUpdateAll": true,
    "updateDependencies": false,
    "addToRecalc": false,
    "event": apogee.deletemember.MEMBER_DELETED_EVENT
}


//This line of code registers the action 
apogee.action.addActionInfo(apogee.deletemember.ACTION_NAME,apogee.deletemember.ACTION_INFO);;
/** This namespace contains the update folder function action */
apogee.updatefolderfunction = {};

/** Update folder function action name 
 * Action Data format:
 * {
 *  "action": apogee.updatefolderfunction.ACTION_NAME,
 *  "member": (member to move),
 *  "argList": (argument list, as an array of strings)
 *  "returnValueString": (name of the return value table)
 *  
 *  "eventInfo": (OUTPUT - event info for the associated delete event)
 * }
 */
apogee.updatefolderfunction.ACTION_NAME = "updateFolderFunction";

/** Update folder function action function */
apogee.updatefolderfunction.updateProperties = function(actionData,optionalContext,processedActions) { 
          
    var folderFunction = actionData.member;
    
    folderFunction.setArgList(actionData.argList);
    folderFunction.setReturnValueString(actionData.returnValueString);
    
    processedActions.push(actionData);
}

/** Action info */
apogee.updatefolderfunction.ACTION_INFO= {
    "actionFunction": apogee.updatefolderfunction.updateProperties,
    "checkUpdateAll": false,
    "updateDependencies": false,
    "addToRecalc": true,
    "event": apogee.updatemember.MEMBER_UPDATED_EVENT
};


//This line of code registers the action 
apogee.action.addActionInfo(apogee.updatefolderfunction.ACTION_NAME,apogee.updatefolderfunction.ACTION_INFO);

;
/** This is a messenger class for sending action messages. */
apogee.action.Messenger = function(fromMember) {

    /** This is a convenience method to set a member to a given value. */
    this.dataUpdate = function(updateMemberName,data) {
        apogee.action.dataUpdate(updateMemberName,fromMember,data,false);
    }

    /** This is a convenience method to set a member to a given value. */
    this.compoundDataUpdate = function(updateInfo) {
        apogee.action.compoundDataUpdate(updateInfo,fromMember,false);
    }

    /** This is a convenience method to set a member tohave an error message. */
    this.errorUpdate = function(updateMemberName,errorMessage) {
        apogee.action.errorUpdate(updateMemberName,fromMember,errorMessage,false);
    }

    /** This is a convenience method to set a member to a given value when the dataPromise resolves. */
    this.asynchDataUpdate = function(updateMemberName,dataPromise) {
        apogee.action.asynchDataUpdate(updateMemberName,fromMember,dataPromise,false);
    }
}


;

module.exports = apogee;


