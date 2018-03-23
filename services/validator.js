const Service = require('webda/services/service');
const Resource = require('../resources/Resource');

module.exports = class ValidatorService extends Service {

  init(config) {
    super.init(config);
    this._validators = [];
    this._config = this.getService('Configuration');
  }

  registerValidator(bean) {
    this._validators.push(bean);
  }

  loadResource() {

  }

  handleEvent(aws, evt) {
    let resources = Resource.fromEvent(aws, evt);
    let promises = [];
    resources.forEach( (resource) => {
      promises.push(this.handleResource(aws, resource));
    });
    return Promise.all(promises);
  }

  handleResource(aws, resource) {
    return resource.load().then( () => {
      let metrics = {};
      let promise = Promise.resolve();
      this._validators.forEach( (validator) => {
        promise = promise.then( () => {
          return validator.validate(aws, resource).then( (met) => {
            for (let i in met) {
              metrics[i] = metrics[i] || 0;
              metrics[i] += met[i];
            }
            return Promise.resolve();
          }).catch( (err) => {
            // Dont fail if one validator fail
            console.log('Validator', validator._name, 'had an issue', err.message);
            return Promise.resolve();
          });
        });
      });
      return promise.then( () => {
        // Resource commit
        return resource.commit();
      }).then( () => {
        return Promise.resolve(metrics);
      });
    });
  }
}