import {
  EC2Resource
} from './EC2Resource';

export default class EIP extends EC2Resource {

  AllocationId: string;

  static getEventMapper() {}

  getId() {
    return this.AllocationId || this._id;
  }

}

export {
  EIP
};
