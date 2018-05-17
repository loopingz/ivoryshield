import {
  Configurer
} from './configurer';

export default class ElkSetup extends Configurer {

  isEnableOn(account, region) {
    return this._accounts.isMainAccount(account.Id);
  }

  async configure(aws, account, region = undefined) {
    this.log('DEBUG', 'Should ELK setup once on', account.Name, 'with', this._params.elasticsearchName, this._params.storageSpace);
  }

  static getModda() {
    return {
      "uuid": "IvoryShield/ElkSetup",
      "label": "ElasticSearch-Kibana Setup",
      "description": "Store your CloudTrail into a AWS ElasticSearch to allow you to research on it, it can also store the metrics collected by CronChecker",
      "webcomponents": [],
      "logo": "images/icons/dynamodb.png",
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      "configuration": {
        "schema": {
          type: "object",
          properties: {
            "elasticsearchName": {
              type: "string"
            },
            "storageSpace": {
              type: "number",
              title: "Number of Gb for ElasticSearch"
            }
          },
          required: ["elasticsearchName"]
        }
      }
    }
  }
}

export {
  ElkSetup
};