import {
  WebdaServer,
  WebdaConsole
} from 'webda-shell';
import {
  Executor,
  Store
} from 'webda';
import {
  AWSServiceMixIn,
  STS,
  Webda,
  Service,
  AWS
} from '../services/aws-mixin';
import {
  Validator
} from '../validators/validator';
import {
  Configurer
} from '../configurers/configurer';

const path = require('path');
const fs = require('fs');
const glob = require('glob');

/*
const AWS = require('aws-sdk');
exports.handler = (event, context, callback) => {
  // TODO implement
  var result = 'Run task at ' + new Date();
  var ecs = new AWS.ECS();
  var params = {
    taskDefinition: 'nuxeo-cron-checker',
    cluster: 'nuxeo-cloud-automation',
    count: 1,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [
          'subnet-28fdc060',
          'subnet-e2c0b0b8',
          'subnet-14986370'
        ],
        assignPublicIp: 'DISABLED',
        securityGroups: [
          'sg-e1283294'
        ]
      }
    },
    startedBy: 'nuxeo-cronchecker-scheduler'
  };
  ecs.runTask(params, function(err, data) {
    if (err) {
      callback(err, err.stack); // an error occurred
    } else {
      callback(null, result + ' ' + JSON.stringify(data));
    }
  });
};
*/
export class ConfigurationService extends AWSServiceMixIn(Executor) {
  _config: any;
  organization: Promise < any > ;
  static CONFIG_FILENAME = './ivoryshield.config.json';

  init(params) {
    this._awsCache = {};
    this._params = this._params || {};
    this._addRoute('/api/credentials', ["GET", "PUT"], this._restCredentials);
    this._addRoute('/api/accounts', ["GET", "PUT"], this._restAccounts);
    this._addRoute('/api/organization/enable', ["PUT"], this.enableOrganization);
    this._addRoute('/api/organization/disable', ["PUT"], this.disableOrganization);
    this._addRoute('/api/accounts/test', ["PUT"], this.testConnection);
    this._addRoute('/api/me', ["GET"], this.getMe);
    this._addRoute('/api/configurers', ["GET", "PUT"], this._restConfigurers);
    this._addRoute('/api/validators', ["GET", "PUT"], this._restValidators);
    this._addRoute('/api/deployment', ["GET", "PUT"], this._restDeployment);
    this.load();
    this._config.credentials = this._config.credentials || {};
    this._config.configurers = this._config.configurers || {};
    this._config.validators = this._config.validators || {};
    this._aws = this._getAWS({
      region: 'us-east-1',
      accessKeyId: this._config.credentials.accessKeyId,
      secretAccessKey: this._config.credentials.secretAccessKey
    });
    this.reinitClients();
  }

  generateWebdaConfiguration(pretend: boolean) {
    let webdaConfig = {
      version: 1,
      routes: {},
      models: {},
      services: {},
      parameters: {}
    };
    let webdaDeployment = {
      type: 'deployment',
      uuid: 'ivoryshield',
      parameters: {},
      resources: {},
      services: {},
      units: []
    };
    for (let id in this._config.credentials) {
      console.log(id, this._config.credentials[id]);
      webdaConfig.parameters[id] = this._config.credentials[id];
    }
    webdaConfig.parameters['accounts'] = this._config.accounts;
    webdaConfig.parameters['pretend'] = pretend;
    webdaConfig.parameters['mainAccount'] = this._config.deployment.mainAccount;
    webdaConfig.parameters['deployment'] = this._config.deployment;
    for (let id in this._config.configurers) {
      webdaConfig.services[id] = this._config.configurers[id];
    }
    for (let id in this._config.validators) {
      webdaConfig.services[id] = this._config.validators[id];
    }
    webdaConfig.services['IvoryShield/ValidatorService'] = {};
    webdaConfig.services['IvoryShield/CronCheckerService'] = {};
    webdaConfig.services['IvoryShield/AccountsService'] = {};
    webdaConfig.services['IvoryShield/CloudTrailService'] = {};
    webdaConfig.services['Webda/ConsoleLogger'] = {};

    if (!this._config.deployment.subnets || !this._config.deployment.taskRole || !this._config.deployment.securityGroup) {
      this.log('WARN', 'Missing deployment required configuration');
      //return;
    }
    let unit: any = {
      clusterName: this._config.deployment.clusterName || 'ivoryshield',
      subnets: this._config.deployment.subnets,
      repositoryNamespace: '',
      tasksNumber: "0",
      taskMemory: "1024",
      taskCpu: "512",
      taskRole: this._config.deployment.taskRole,
      publicIp: 'DISABLED',
      securityGroup: this._config.deployment.securityGroup,
      type: 'WebdaDeployer/Fargate',
      name: 'ivoryshield'
    }
    // Set the CronChecker
    unit.serviceName = this._config.deployment.croncheckServiceName || 'ivoryshield/cron';
    unit.workers = ['IvoryShield/CronCheckerService'];
    webdaDeployment.units.push(unit);
    // Duplicate the unit
    unit = JSON.parse(JSON.stringify(unit));
    if (this._config.configurers['IvoryShield/CloudTrailSetup']) {
      // Set the near real time event
      unit.workers = ['IvoryShield/CloudTrailService'];
      unit.tasksNumber = "1";
      unit.name = unit.serviceName = this._config.deployment.cloutrailServiceName || 'ivoryshield/cloudtrail';
      webdaDeployment.units.push(unit);
    }
    if (!fs.existsSync('./deployments')) {
      fs.mkdirSync('deployments');
    }
    fs.writeFileSync('./deployments/ivoryshield', JSON.stringify(webdaDeployment, null, ' '));
    fs.writeFileSync('./webda.config.json', JSON.stringify(webdaConfig, null, ' '));
    return webdaConfig;
  }

  getServicesImplementations(type) {
    let result = {};
    for (let i in this._webda._services) {
      // Check if it is a Validator and has Modda
      if (this._webda._services[i].prototype instanceof type && this._webda._services[i].getModda) {
        let modda = this._webda._services[i].getModda();
        if (!modda) {
          this.log('ERROR', 'Service', i, 'does not export any modda');
          continue;
        }
        result[i] = modda;
      }
    }
    return result;
  }

  _restDeployment(ctx) {
    if (ctx._route._http.method === 'GET') {
      ctx.write(this._config.deployment || {});
    } else if (ctx._route._http.method === 'PUT') {
      this._config.deployment = ctx.body;
      return this.save();
    }
  }
  _restValidators(ctx) {
    if (ctx._route._http.method === 'GET') {
      // Get map of configurers
      let validators = this.getServicesImplementations(Validator);
      Object.keys(validators).map((key, index) => {
        if (!validators[key]) {
          this.log('WARN', 'Cannot find validator', key);
          return;
        }
        validators[key].enable = this._config.validators[key] !== undefined;
        if (validators[key].configuration) {
          validators[key].configuration.value = this._config.validators[key];
        }
      });
      ctx.write(validators);
    } else if (ctx._route._http.method === 'PUT') {
      if (ctx.body.enable) {
        this._config.validators[ctx.body.uuid] = ctx.body.configuration;
      } else {
        delete this._config.validators[ctx.body.uuid];
      }
      return this.save();
    }
  }

  _restConfigurers(ctx) {
    if (ctx._route._http.method === 'GET') {
      // Get map of configurers
      let configurers = this.getServicesImplementations(Configurer);
      Object.keys(configurers).map((key, index) => {
        configurers[key].enable = this._config.configurers[key] !== undefined;
        if (configurers[key].configuration) {
          configurers[key].configuration.value = this._config.configurers[key];
        }
      });
      ctx.write(configurers);
    } else if (ctx._route._http.method === 'PUT') {
      if (ctx.body.enable) {
        this._config.configurers[ctx.body.uuid] = ctx.body.configuration;
      } else {
        delete this._config.configurers[ctx.body.uuid];
      }
      return this.save();
    }
  }

  _restAccounts(ctx) {
    if (ctx._route._http.method === 'PUT') {
      if (!this._config.accounts) {
        throw 400;
      }
      this._config.accounts = ctx.body;
      return this.save();
    } else if (ctx._route._http.method === 'GET') {
      if (this._config.accounts) {
        ctx.write(this._config.accounts);
      } else {
        return this.getOrganization(ctx);
      }
    }
  }

  enableOrganization(ctx) {
    delete this._config.accounts;
    return this.save().then(async () => {
      await this.reinitOrganization();
      return this.getOrganization(ctx);
    });
  }

  disableOrganization(ctx) {
    this._config.accounts = [];
    return this.save().then(() => {
      ctx.write(this._config.accounts);
    });
  }

  async reinitOrganization() {
    let aws = this._aws;
    if (this._config.credentials.organizationAccountId) {
      this._params.externalId = this._config.credentials.externalId;
      this._params.role = this._config.credentials.role;
      aws = await this._getAWSForAccount(this._config.credentials.organizationAccountId);
    }
    this.organization = new(aws.Organizations)().listAccounts({}).promise();
  }

  async reinitClients() {
    this._sts = new this._aws.STS();
    this.mainAccount = this._sts.getCallerIdentity().promise();
    if (!this._config.accounts) {
      await this.reinitOrganization();
    }
  }

  async testConnection(ctx) {
    this._aws = this._getAWS({
      region: 'us-east-1',
      accessKeyId: ctx.body.accessKeyId,
      secretAccessKey: ctx.body.secretAccessKey
    });
    await this.reinitClients();
    let accounts;
    if (this._config.accounts) {
      accounts = this._config.accounts
    } else {
      accounts = (await this.organization).Accounts;
    }
    let promises = accounts.map((acc) => {
      acc.AssumeRoleSuccessful = false;
      acc.AssumeRoleError = null;
      return this._assumeRole(acc.Id, ctx.body.role, ctx.body.externalId, 'us-east-1', true).then(() => {
        acc.AssumeRoleSuccessful = true;
      }).catch((err) => {
        acc.AssumeRoleError = err;
        acc.AssumeRoleSuccessful = false;
      });
    });
    await Promise.all(promises);
    ctx.write(accounts);
  }

  save() {
    return new Promise((resolve, reject) => {
      this._config.lastUpdate = new Date();
      if (this._config.accounts) {
        this._config.accounts.map((acc) => {
          delete acc.AssumeRoleSuccessful;
          delete acc.AssumeRoleError;
        });
      }
      fs.writeFile('./ivoryshield.config.json', JSON.stringify(this._config, null, ' '), (err, res) => {
        if (err) {
          reject(err);
        }
        resolve(res);
      });
    });
  }

  load() {
    if (fs.existsSync(ConfigurationService.CONFIG_FILENAME)) {
      this._config = JSON.parse(fs.readFileSync(ConfigurationService.CONFIG_FILENAME));
    } else {
      this._config = {
        credentials: {
          role: 'OrganizationAccountAccessRole'
        }
      };
    }
  }

  _restCredentials(ctx) {
    if (ctx._route._http.method === 'PUT') {
      this._config.credentials = ctx.body;
      return this.save();
    } else if (ctx._route._http.method === 'GET') {
      // Get credentials
      ctx.write(this._config.credentials);
    }
  }

  getMe(ctx) {
    let mainAccount;
    return this.mainAccount.then((acc) => {
      mainAccount = acc;
    }).catch((err) => {
      this.log('WARN', 'Cannot get the main account');
    }).then(() => {
      ctx.write({
        mainAccount: mainAccount,
        useOrganization: this._config.accounts === undefined
      });
    });
  }

  getOrganization(ctx) {
    return this.organization.then((accounts) => {
      ctx.write(accounts.Accounts);
    }).catch((err) => {
      if (err.code === 'AccessDeniedException') {
        throw 403;
      }
      throw 500;
    });
  }
}

var ServerConfig = {
  version: 1,
  parameters: {
    website: {
      url: 'localhost',
      path: 'wui/',
      index: 'index.html'
    }
  },
  services: {
    configuration: {
      require: ConfigurationService
    }
  }
};

class IvoryShieldConfigurationServer extends WebdaServer {
  _webdaModule: any = {};

  serveStaticWebsite(express, app) {
    app.use(express.static(__dirname + '/../../wui/'));
  }

  serveIndex(express, app) {
    app.use(express.static(__dirname + '/../../wui/index.html'));
    app.get('*', this.handleStaticIndexRequest.bind(this));
  }

  serve(port, openBrowser) {
    this._staticIndex = path.resolve(__dirname + '/../../wui/index.html');
    // This is the configuration server
    super.serve(port);
    if (openBrowser || openBrowser === undefined) {
      var open = require('open');
      open("http://localhost:" + port);
    }
  }

  loadConfiguration(config) {
    return ServerConfig;
  }
}

export default class IvoryShieldConsole extends WebdaConsole {

  static help() {
    let lines = [];
    lines.push('config'.bold + ' launch web ui configuration');
    lines.push('check'.bold + ' perform a local check of the environment');
    lines.push('install'.bold + ' setup your AWS accounts');
    lines.push('deploy'.bold + ' deploy your new configuration');
    lines.push('test'.bold + ' test a configurer or a validator');
    return this.logo(lines);
  }

  static parser(args) {
    const argv = require('yargs');
    return argv.option('commit', {
        type: 'boolean',
        alias: 'c'
      })
      .option('log-level', {
        default: 'ACTION'
      })
      .option('log-levels', {
        default: 'ERROR, VULN, WARN, ACTION, CONSOLE, INFO, DEBUG, TRACE'
      })
      .alias('d', 'deployment').parse(args);
  }

  static logo(lines = []) {
    const logoLines = require('../../logo.json');
    console.log('');
    logoLines.forEach((line, idx) => {
      line = '  ' + line.join('') + '  ';
      if (idx > 0 && lines.length > (idx - 1)) {
        line = line + lines[idx - 1];
      }
      console.log(line);
    });
    console.log('');
  }

  static config(argv) {
    this.generateModule();
    if (argv.deployment) {
      return super.config(argv);
    }
    let webda = new IvoryShieldConfigurationServer();
    return new Promise(() => {
      webda.serve(18181, argv.open);
    });
  }

  static check(argv) {
    this.generateModule();
    this.initWebda(!argv.commit);
    return super.worker({
      deployment: 'ivoryshield',
      _: ['worker', 'IvoryShield/CronCheckerService']
    });
  }

  static deploy(argv) {
    this.generateModule();
    this.initWebda(false);
    // Deploy on AWS through Webda
    return super.deploy({
      deployment: 'ivoryshield',
      _: []
    });
  }

  static initWebda(pretend: boolean = true) {
    let webda = new IvoryShieldConfigurationServer();
    let configurationService = < ConfigurationService > webda.getService('configuration');
    //new ConfigurationService(webda, 'ivoryshield', {});
    configurationService.generateWebdaConfiguration(pretend);
  }

  static test(argv) {
    this.generateModule();
    this.initWebda(!argv.commit);
    let args = ['worker', 'IvoryShield/CronCheckerService', 'test'];
    args = args.concat(argv._.slice(1));
    return super.worker({
      deployment: 'ivoryshield',
      _: args
    })
  }

  static handleCommand(args) {
    let argv = this.parser(args);
    this.initLogger(argv);
    switch (argv._[0]) {
      case 'config':
        return this.config(argv);
      case 'check':
        return this.check(argv);
      case 'deploy':
        return this.deploy(argv);
      case 'test':
        return this.test(argv);
      case 'worker':
        return this.worker(argv);
      case 'help':
      default:
        return this.help();
    }
  }
}
