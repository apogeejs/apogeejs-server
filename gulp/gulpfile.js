const { src, dest, series } = require('gulp');
const zip = require('gulp-zip');
const clean = require('gulp-clean');
const replace = require('gulp-replace');
const versionConfig = require('./versionConfig.json');


//==============================
// Top Level Values
//==============================
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

const fs = require("fs");
if(fs.existsSync(DIST_FOLDER + "/" + ZIP_FILE_NAME)) {
    throw new Error("The release folder already exists! Please verify this is the proper destination and clear it.");
}

//===========================
// Release tasks
//===========================
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
    () => cleanFolderTask(TEMP_FOLDER),
    updatePackageFileVersion,
    updatePackageLockFileVersion,
    createReleaseZip,
    () => cleanFolderTask(TEMP_FOLDER)
);

exports.release = release;

