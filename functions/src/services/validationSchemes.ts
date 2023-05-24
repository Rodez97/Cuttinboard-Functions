import * as yup from "yup";

export const GeneralManagerSchema = yup.object().shape({
  name: yup.string().required(),
  lastName: yup.string().required(),
  email: yup.string().email().required(),
});
