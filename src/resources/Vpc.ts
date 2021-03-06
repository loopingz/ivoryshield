import {
  EC2Resource
} from './EC2Resource';


export default class Vpc extends EC2Resource {

  VpcId: string;

  static getEventMapper() {}

  getId() {
    return this.VpcId || this._id;
  }

}

export {
  Vpc
};
