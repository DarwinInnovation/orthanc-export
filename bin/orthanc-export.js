const fs = require('fs');

const orthanc_exporter = require("../lib/orthanc-exporter");
const parseJson = require('parse-json');

const _ = require('lodash');
var orthanc_export = require("commander");
const package = require("../package.json");

orthanc_export
    .version(package.version)
    .option('-c, --config [file]', 'Path to configuration file')
    .option('-s, --state [file]', 'Path to state saving file')
    .option('-l, --last [int]', 'Overrde stored last update value.');
    .parse(process.argv);

if (_.isUndefined(orthanc_export.config)) {
  orthanc_export.config = "/etc/orthanc/orthanc-export.json";
}
if (_.isUndefined(orthanc_export.state)) {
  orthanc_export.state = "/var/orthanc/orthanc-export-state.json";
}

const cfg = parseJson(fs.readFileSync(orthanc_export.config), orthanc_export.config);

if (_.isUndefined(cfg.state)) {
  cfg.state = orthanc_export.state;
}

if (_.has(orthanc_export, 'last')) {
  cfg.last_update = orthanc_export.last;
}

var exporter = new orthanc_exporter(cfg);

exporter.start();