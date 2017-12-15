const fs = require('fs');
const path = require('path');
const EventEmitter = require('events').EventEmitter;

const oc = require("orthanc-client");

const parseJson = require('parse-json');
const _ = require('lodash');
var async = require('async');
var debug = require("debug")("Exporter");
const moment = require('moment');

const ChangeListener = require('./ChangeListener');
const Destination = require('./Destination');

class Exporter extends EventEmitter {
  constructor(cfg) {
    super();

    this._cfg = cfg;

    this._client = new oc(
        cfg.server
    );

    this._tmp_dir = cfg.tmp || "/tmp/orthanc-export";
    mkdirp.sync(this._tmp_dir);

    this._load_state();

    this._create_destinations();

    this._instance_q = async.queue((series_chg, next) => {
      if (_.isNumber(series_chg)) {
        this._state.last_update = series_chg;
        this._save_state();
      } else {
        this._on_new_instance(series_chg)
            .then(() => {
              next();
            })
            .catch((err) => {
              next(err);
            });
      }
    });

    this._listener = new ChangeListener(this._client, cfg.period, this._state.last_update);
  }

  start() {
    this._listener.on('new_instance', (id, details) => {
      this._new_instance(id, details);
    });

    this._listener.on('change', (last_id) => {
      this._instance_q.push(last_id);
    });

    this._listener.start();
  }

  _new_instance(id, details) {
    console.log('new instance', id, details.Seq);

    this._instance_q.push(details);
  }

  _load_state() {
    if (fs.existsSync(this._cfg.state)) {
      this._state = parseJson(fs.readFileSync(this._cfg.state), this._cfg.state);
    } else {
      this._state = {
        last_update: 6000
      };
    }

    if (_.has(this._cfg, 'last_update')) {
      this._state.last_update = this._cfg.last_update;
    }
  }

  _save_state() {
    fs.writeFileSync(this._cfg.state, JSON.stringify(this._state, 2));
  }

  _on_new_instance(inst_chg) {
    return new Promise((resolve, reject) => {
      this._decorate_instance(inst_chg)
          .then((instance) => {
            this._download_instance(instance)
                .then(() => {
                  this._export_instance(instance)
                      .then(() => {
                        this._state.last_update = inst_chg.Seq;
                        this._save_state();

                        fs.unlinkSync(instance.tmp_path);

                        resolve();
                      })
                      .catch((err) => {
                        reject(err);
                      });
                })
                .catch((err) => {
                  reject(err);
                });
          })
          .catch((err) => {
            reject(err);
          });
    });
  }

  _decorate_instance(inst_chg) {
    return new Promise((resolve, reject) => {
      debug("Decorating "+inst_chg.ID);
      this._client.instances
          .getTags(inst_chg.ID, true)
          .then((tags) => {
            debug("  received simplified tags");
            _.assign(inst_chg, tags);
            resolve(inst_chg);
          })
          .catch((err) => {
            console.error("Error getting instance tags", err);
            reject(err);

          });
    });
  }

  _download_instance(instance) {
    return new Promise((resolve, reject) => {
        instance.tmp_path = this._get_tmp(instance.ID + '.dcm');

        if (!fs.existsSync(instance.tmp_path)) {
          debug("Downloading " + instance.ID);
          this._client.instances
              .getFile(instance.ID)
              .then((buffer, length) => {
                debug("  " + instance.ID + " " + buffer.length + " bytes");
                fs.writeFileSync(instance.tmp_path, buffer);
                resolve();
              })
              .catch((err) => {
                reject(err);
              });
        } else {
          debug("Found " + instance.ID);
          resolve();
        }
      });
  }

  _export_instance(instance) {
    return new Promise((resolve, reject) => {
      this._process_metadata(instance);

      async.eachLimit(this._destinations, 2, (destination, cb) => {
        destination.export_instance(instance)
            .then(() => {
              cb();
            })
            .catch((err) => {
              cb(err);
            })
      }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  _process_metadata(instance) {
    instance.name = _.map(_.split(_.trim(instance.PatientName), '^'),
        (nm) => {
            return _.replace(_.startCase(nm), /\s+/g, '_');
        }
    );

    instance.desc = instance.SeriesDescription || instance.Modality;
    instance.desc_snake = _.replace(instance.desc, /\s+/g, '_')

    debug("  parsing date/time: "+instance.AcquisitionDateTime);
    let dt = instance.AcquisitionDateTime;
    if (dt.length == 14) {
      dt = dt.slice(0,8) + 'T' + dt.slice(8);
    } else if (dt.length == 21) {
      dt = dt.slice(0,8) + 'T' + dt.slice(8,10);
    }
    instance.moment = moment(dt);
  }

  _get_tmp(filename) {
    return path.join(this.tmpdir, filename);
  }

  _create_destinations() {
    this._destinations = _.map(this._cfg.destinations, (desc) => {
      return new Destination(this, desc);
    });
  }

  get_dcm4che(util) {
    let cmd = util;
    if (this._cfg.dcm4che) {
      cmd = path.join(this._cfg.dcm4che, 'bin', util);
    }
    if (process.platform == 'win32') {
      cmd = cmd + '.bat';
    }
    return cmd;
  }
}

module.exports = Exporter;