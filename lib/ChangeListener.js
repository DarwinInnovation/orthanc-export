const EventEmitter = require('events').EventEmitter;

const parseJson = require('parse-json');
const _ = require('lodash');


class ChangeListener extends EventEmitter {
  constructor(client, period, last_update) {
    super();

    this._client = client;
    this._period = period || (60 * 1000);
    this._last_update = last_update || 0;

    this._updating = false;

    this._interval = null;
  }

  start() {
    if (!this._interval) {
      this._interval = setInterval(() => {
        this._poll();
      }, this._period);
      this._poll();
    }
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
    }
    this._interval = null;
  }

  _poll() {
    if (this._updating)
      return;

    this._updating = true;

    this._client.changes
        .getChanges({
          since: this._last_update
        })
        .then((json) => {
          this._handle_changes(json);

          this._updating = false;
          if (!json.Done) {
            this.poll();
          }
    });
  }

  _handle_error(err) {
    this.emit('error', err);
  }

  _handle_changes(json) {
    _.each(json.Changes, (change) => {
      if (change.ChangeType == "NewInstance") {
        this.emit("new_instance", change.ID, change);
      } else if (change.ChangeType == "NewSeries") {
        this.emit("new_series", change.ID, change);
      } else if (change.ChangeType == "NewStudy") {
        this.emit("new_study", change.ID, change);
      } else if (change.ChangeType == "NewPatient") {
        this.emit("new_patient", change.ID, change);
      }
    });

    this._last_update = json.Last;
    this.emit('change', this._last_update);
  }
}

module.exports = ChangeListener;