import {
  IEmployee,
  IOrganizationEmployee,
} from "@cuttinboard-solutions/types-helpers";
import { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";

export const employeeConverter = {
  toFirestore(object: IEmployee): DocumentData {
    const { refPath, id, ...objectToSave } = object;
    return objectToSave;
  },
  fromFirestore(value: QueryDocumentSnapshot<IEmployee>): IEmployee {
    const { id, ref } = value;
    const rawData = value.data();
    return {
      ...rawData,
      id,
      refPath: ref.path,
    };
  },
};

export const orgEmployeeConverter = {
  toFirestore(object: IOrganizationEmployee): DocumentData {
    const { refPath, id, ...objectToSave } = object;
    return objectToSave;
  },
  fromFirestore(
    value: QueryDocumentSnapshot<IOrganizationEmployee>
  ): IOrganizationEmployee {
    const { id, ref } = value;
    const rawData = value.data();
    return {
      ...rawData,
      id,
      refPath: ref.path,
    };
  },
};
