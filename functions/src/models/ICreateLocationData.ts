import { ILocationAddress } from "@rodez97/types-helpers";

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
  promo?: string | undefined;
}
