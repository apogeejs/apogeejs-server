const { src, dest, series } = require('gulp');
const zip = require('gulp-zip');
const clean = require('gulp-clean');
const replace = require('gulp-replace');
const versionConfig = require('./versionConfig.json');
const fs = require("fs");


//===========================
// Release tasks
//===========================
const DIST_FOLDER = versionConfig.OFFICIAL_RELEASE ? "../releases" : "../releases-dev";
const TEMP_FOLDER = "temp";

const RELEASE_FILES = [
    "../src/**/*",
    "!../src/**/node_modules",
    "!../src/**/node_modules/**/*",
    "!../src/package.json",
    "!../src/package-lock.json",
    "temp/package.json",
    "temp/package-lock.json",
    "../license"
]

const ZIP_FILE_NAME = "ApogeeServer_v" + versionConfig.VERSION_NUMBER + ".zip";


function makeSureReleaseNotPresent() {
    let promise = new Promise( (resolve,reject) => {
        fs.stat(DIST_FOLDER + "/" + ZIP_FILE_NAME, (err, stats) => {
            if (err) resolve("File is not present!");
            else reject("Release is already present! If this should not be true, check the version numbers");
        });
    })
    return promise;
}

function updatePackageFileVersion() {
    return src('../src/package.json')
        .pipe(replace("0.0.0-pAPOGEE",versionConfig.VERSION_NUMBER))
        .pipe(dest(TEMP_FOLDER));
}

function updatePackageLockFileVersion() {
    return src('../src/package-lock.json')
        .pipe(replace("0.0.0-pAPOGEE",versionConfig.VERSION_NUMBER))
        .pipe(dest(TEMP_FOLDER));
}

function createReleaseZip() {
    return src(RELEASE_FILES)
        .pipe(zip(ZIP_FILE_NAME))
        .pipe(dest(DIST_FOLDER))
}

//clean (delete) a folder
function cleanFolderTask(folder) {
    return src(folder, {read: false, allowEmpty: true})
        .pipe(clean({force: true}));
}

let release = series(
    makeSureReleaseNotPresent,
    () => cleanFolderTask(TEMP_FOLDER),
    updatePackageFileVersion,
    updatePackageLockFileVersion,
    createReleaseZip,
    () => cleanFolderTask(TEMP_FOLDER)
);

//===========================
// Update Lib tasks
//===========================

const SOURCE_LIB_PATH = "../../ApogeeJS/web/" + (versionConfig.APOGEE_CORE_IS_RELEASE ? "releases" : "releases-dev") + "/lib/v" + versionConfig.APOGEE_CORE_VERSION_NUMBER;

const LIB_FOLDER = "../src/lib";

const LIB_FILE_NAMES = [
    "apogeeCoreBundle.cjs.js",
    "debugHook.js",
    "versionConfig.json",
    "nodeGlobals.js"
]

function getLibFiles() {
    let libFiles = LIB_FILE_NAMES.map( fileName => SOURCE_LIB_PATH + "/" + fileName);
    //note - the "base" entry is needed so they source directoy structure is kept, rather than flattening it
    return src(libFiles,{base: SOURCE_LIB_PATH})
        .pipe(dest(LIB_FOLDER))
}

let updateLib = series(
    () => cleanFolderTask(LIB_FOLDER),
    getLibFiles
)

//===========================
// Push Release tasks
//===========================

const WEB_DOWNLOADS_FOLDER = "../../ApogeeJS-website/web/downloads";

function makeSureReleaseNotAlreadyThere() {
    let promise = new Promise( (resolve,reject) => {
        fs.stat(WEB_DOWNLOADS_FOLDER + "/" + ZIP_FILE_NAME, (err, stats) => {
            if (err) resolve("File is not present!");
            else reject("Release file is present on server!");
        });
    })
    return promise;
}

function copyZipToServer() {
    let zipFile = DIST_FOLDER + "/" + ZIP_FILE_NAME;
    
    //note - the "base" entry is needed so they source directoy structure is kept, rather than flattening it
    return src(zipFile)
        .pipe(dest(WEB_DOWNLOADS_FOLDER))
}

let pushRelease = series(
    makeSureReleaseNotAlreadyThere,
    copyZipToServer
)


//=============================================
// EXPORTS
//=============================================

exports.release = release;
exports.updateLib = updateLib;
exports.pushRelease = pushRelease;

