const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const EventEmitter = require('events').EventEmitter;

const oc = require("orthanc-client");

const parseJson = require('parse-json');
const _ = require('lodash');
var async = require('async');
var debug = require("debug")("Exporter");
const moment = require('moment');
const mkdirp = require('mkdirp');

class Destination {
  constructor(exporter, desc) {
    this._exporter = exporter;
    this._desc = desc;

    this._type = desc.type || "dcm2dcm";
    this._args = desc.args || "";

    this._tmpl_topdir = this._desc.topdir;
    this._tmpl_dir = _.template(this._desc.dir);
    this._tmpl_filename = _.template(this._desc.filename);

    this._create_cmds();
    this._create_matches();
    this._create_links();
    this._create_postprocess();
  }

  export_instance(instance) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(instance.tmp_path)) {
        return reject(new Error("Instance file doesn't exist"));
      }

      if (!this._test_matches(instance)) {
        resolve();
        return;
      }

      let dst_dir = this._get_target_dir(instance);
      if (!fs.existsSync(dst_dir)) {
        mkdirp.sync(dst_dir);
      }

      let dst_filename = this._tmpl_filename(instance);

      this._do_export(instance, dst_dir, dst_filename)
          .then(() => {
              this._postprocess(instance, dst_dir, dst_filename)
                  .then(() => {
                    this._mk_links(instance, dst_dir, dst_filename);
                    resolve();
                  });
          })
          .catch((err) => {reject(err)});
    });
  }

  _get_target_dir(instance, tmpl_dst_dir) {
    tmpl_dst_dir = tmpl_dst_dir || this._tmpl_dir;

    let dir = "";
    if (this._tmpl_topdir) {
      dir = this._tmpl_topdir;
    }
    let d = tmpl_dst_dir(instance);
    dir = path.join(dir, d);

    return dir;
  }

  _do_export(instance, dst_dir, dst_filename) {
    return new Promise((resolve, reject) => {
      async.eachSeries(this._cmds, (cmd, cb) => {
        let dstpath = path.join(dst_dir, dst_filename);
        debug("Creating "+dstpath);
        let cmdline = cmd.cmdline + ' "' + instance.tmp_path + '" "' + dstpath + '"';

        child_process.exec(cmdline, (err, stdout, stderr) => {
          if (err) {
            debug("  command failed: ", cmdline);
            debug("    reason: "+err);
          } else {
            debug(stdout);
          }
          cb(err);
        });
      }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  _create_cmds() {
    this._cmds = [
    ];

    let cmdline = null;
    if (_.startsWith(this._type, "dcm2")) {
          cmdline = this._exporter.get_dcm4che(this._type) + ' ' + this._args;
    } else if (this._type == "copy") {
      if (process.platform == 'win32') {
        cmdline = 'copy';
      } else {
        cmdline = 'cp';
      }
    }

    if (cmdline) {
      this._cmds.push({
        cmdline: cmdline
      });
    }
  }

  _create_matches() {
    this._matches = {};

    if (this._desc.match) {
      _.each(this._desc.match, (val, key) => {
        this._matches[key] = new RegExp(val, 'i');
      })
    }
  }

  _test_matches(instance) {
    return !_.some(this._matches, (val, key) => {
      if (!instance[key] || !_.isString(instance[key])) {
        return true;
      }

      return !(val.test(instance[key]));
    });
  }

  _create_links() {
    this._links = [];

    if (this._desc.link) {
      this._links.push({
        dir: _.template(this._desc.link)
      });
    }
    if (this._desc.links) {
      _.each(this._desc.links, (lnk) => {
        let lo = {};
        if (lnk.dir) {
          lo.dir = _.template(lnk.dir);
        }
        if (lnk.filename) {
          lo.filename = _.template(lnk.filename);
        }
        this._links.push(lo);
      });
    }
  }

  _mk_links(instance, dst_dir, dst_filename) {
    _.each(this._links, (link) => {
      let dst_path = path.join(dst_dir, dst_filename);

      let dst_linkdir = this._get_target_dir(instance, link.dir);
      let dst_linkname = dst_filename;
      if (link.filename) {
        dst_linkname = link.filename(instance);
      }
      let dst_link = path.join(dst_linkdir, dst_linkname);

      if (!fs.existsSync(dst_linkdir)) {
        mkdirp.sync(dst_linkdir);
      }
      debug("Linking to "+dst_link);
      try {
        fs.symlinkSync(dst_path, dst_link);
      } catch (err) {
        debug("Failed to create symlink:"+err);
      }
    });
  }

  _create_postprocess() {
    this._postprocess_steps = [];

    if (this._desc.postprocess) {
      let pp = this._desc.postprocess;
      if (_.isString(pp)) {
        this._postprocess_steps.push({
          cmdline: pp
        });
      }
      //TODO: Other descriptions
    }
  }

  _postprocess(instance, dst_dir, dst_filename) {
    return new Promise((resolve, reject) => {
      async.eachSeries(this._postprocess_steps, (pp, cb) => {
        let dst_path = path.join(dst_dir, dst_filename);

        debug("Post process " + dst_path);
        let cmdline = pp.cmdline + ' "' + dst_path + '"';
        try {
          child_process.exec(cmdline, (err, stdout, stderr) => {
            if (err) {
              debug("  postprocess command failed: ", cmdline);
              debug("    reason: " + err);
            } else {
              debug(stdout);
            }
            cb(err);
          });
        } catch (err) {
          debug("Failed to create symlink:" + err);
        }
      }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

module.exports = Destination;