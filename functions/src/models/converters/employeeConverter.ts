import {
  IEmployee,
  IEmployeesDocument,
  IOrganizationEmployee,
} from "@cuttinboard-solutions/types-helpers";
import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

export const employeeDocConverter: FirestoreDataConverter<IEmployeesDocument> =
  {
    toFirestore(object: IEmployeesDocument): DocumentData {
      return object;
    },
    fromFirestore(
      value: QueryDocumentSnapshot<IEmployeesDocument>
    ): IEmployeesDocument {
      const rawData = value.data();
      return rawData;
    },
  };

export const employeeDocArrayConverter: FirestoreDataConverter<IEmployee[]> = {
  toFirestore(object: any): DocumentData {
    return object;
  },
  fromFirestore(value: QueryDocumentSnapshot<IEmployeesDocument>): IEmployee[] {
    const rawData = value.data();

    return rawData.employees ? Object.values(rawData.employees) : [];
  },
};

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
