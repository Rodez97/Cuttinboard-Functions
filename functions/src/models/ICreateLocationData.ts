import { ILocationAddress } from "@cuttinboard-solutions/types-helpers";

export interface ICreateLocationData {
  location: {
    name: string;
    intId?: string;
    address?: ILocationAddress;
  };
  generalManager?: {
    name: string;
    lastName: string;
    email: string;
  };
}
