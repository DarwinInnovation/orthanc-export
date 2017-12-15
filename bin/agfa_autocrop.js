/**
 * Created by richardm on 13/09/2017.
 */

'use strict';

const path = require('path');
const debug = require('debug')('orthanc_jpg_export');
const fs = require('fs-extra');
const child_process = require('child_process');
const moment = require('moment');
const _ = require('lodash');
const async = require('async');
const tmp = require('tmp');
const package_json = require("../package.json");

var agfa_autocrop = require("commander");

agfa_autocrop
    .version(package_json.version)
    .option('-f, --fuzz [percentage]', 'Percentage fuzz alliwed on auto crop', parseFloat)
    .option('-c, --chop [pixels]', 'Number of pixels to chop', parseInt)
    .option('-a, --accept [pixels]', 'Accept threshold', parseInt)
    .option('-v, --verbose', 'Verbose output')
    .parse(process.argv);


let VERBOSE = false;

if (agfa_autocrop.verbose) {
  VERBOSE = true;
}

if (agfa_autocrop.fuzz) {
  agfa_autocrop.fuzz = ""+agfa_autocrop.fuzz+"%";
}

let cfg = _.defaults(agfa_autocrop, {
  "fuzz": "20%",
  "chop": 36,
  "accept": 150,
  "locale": "en-gb"
});

moment.locale(cfg.locale);

//const jpg_path = path.join(__dirname, 'jpg');

function extract_size(text_sizes) {
  let re = new RegExp("^([0-9]+)x([0-9]+)$");

  let m = re.exec(text_sizes);

  return { w: parseInt(m[1]), h: parseInt(m[2])};
}

function autocrop (jpgpath, done_cb) {
  tmp.dir((err, tmppath, cleanup_cb) => {

    let sizes = {};

    debug("Auto crop: "+jpgpath);

    let jpg_dir = path.dirname(jpgpath);
    let jpg_base = path.basename(jpgpath, '.jpg');

    function trim_first(next) {
      let cmd = 'magick convert "' + jpgpath + '" -fuzz ' + cfg.fuzz + ' -trim +repage -print \"%wx%h\" "' + jpgpath +'"';
      child_process.exec(cmd, (error, stdout, stderr) => {
        if (error) {
          next(error);
          return;
        }

        sizes.base = _.extend({}, extract_size(stdout), {
          path: jpgpath,
        });

        next();
      });
    }

    function mk_trim_edge(geometry, edge) {
      let name = path.join(tmppath, jpg_base + "_" + edge + ".jpg");
      return function (next) {
        let cmd = 'magick convert "' + jpgpath +
            '" -gravity ' + edge +
            " -chop " + geometry +
            " +repage -fuzz " + cfg.fuzz +
            ' -trim +repage -print \"%wx%h\" "' + name + '"';
        child_process.exec(cmd, (error, stdout, stderr) => {
          if (error) {
            next(error);
            return;
          }

          sizes[edge] = _.extend({}, extract_size(stdout), {
            path: name,
          });

          next();
        });
      }
    }

    function choose_img() {
      let base = sizes.base;

      debug("  base: "+base.w+"x"+base.h);

      // First round - are any significantly smaller than base image?
      let subset = {};
      _.each(["north", "south", "east", "west"], (edge) => {
        let size = sizes[edge];
        if ((size.w < (base.w - cfg.accept)) ||
            (size.h < (base.h - cfg.accept))) {
          subset[edge] = size;
        }
      });

      let keys = _.keys(subset);
      if (keys.length != 0) {
        // Now choose best image
        let best = null;
        _.each(keys, (key) => {
          let size = sizes[key];
          debug("  "+key+": "+size.w+"x"+size.h);
          if (best === null) {
            best = size;
          } else if (best.w < size.w || best.h < size.h) {
            best = size;
          }
        });
        debug("  selected: "+path.basename(best.path));
        fs.unlinkSync(base.path);
        fs.copySync(best.path, base.path);
      }

      _.each(["north", "south", "east", "west"], (edge) => {
        let size = sizes[edge];
        fs.unlinkSync(size.path);
      });

    }

    let geom_we = ""+cfg.chop+"x0+0+0";
    let geom_ns = "0x"+cfg.chop+"+0+0";

    async.series([
      trim_first,
      mk_trim_edge(geom_we, "west"),
      mk_trim_edge(geom_we, "east"),
      mk_trim_edge(geom_ns, "north"),
      mk_trim_edge(geom_ns, "south")
    ], (err) => {
      if (err) {
        console.error(err);
      } else {
        choose_img();
      }
      cleanup_cb();
      done_cb();
    });
  });
}

  async.eachSeries(agfa_autocrop.args, (jpgfile, next) => {
    if (VERBOSE) {
      console.log("Cropping " + jpgfile);
    }
    autocrop(jpgfile, next);
  }, (err) => {
    if (VERBOSE) {
      console.log("Finished.");
    }
    if (err) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
