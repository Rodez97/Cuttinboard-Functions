# Cuttinboard Config Data

**Author**: Cuttinboard 

**Description**: Controls access to paid content by syncing your one-time and recurring payments with Firebase Authentication.



**Configuration Parameters:**

* Cloud Functions deployment location: Where do you want to deploy the functions created for this extension? You usually want a location close to your database. For help selecting a location, refer to the [location selection guide](https://firebase.google.com/docs/functions/locations).

* Products and pricing plans collection: What is the path to the Cloud Firestore collection where the extension should store Stripe pricing plans?

* Customer details and subscriptions collection: What is the path to the Cloud Firestore collection where the extension should store Stripe customer details? This can be the location of an existing user collection, the extension will not overwrite your existing data but rather merge the Stripe data into your existing `uid` docs.

* Stripe configuration collection: What is the path to the Cloud Firestore collection where the extension should store Stripe configuration?

* Sync new users to Stripe customers and Cloud Firestore: Do you want to automatically sync new users to customer objects in Stripe? If set to 'Sync', the extension will create a new customer object in Stripe and add a new doc to the customer collection in Firestore when a new user signs up via Firebase Authentication. If set to 'Do not sync' (default), the extension will create the customer object "on the fly" with the first checkout session creation.

* Automatically delete Stripe customer objects: Do you want to automatically delete customer objects in Stripe? When a user is deleted in Firebase Authentication or in Cloud Firestore and set to 'Auto delete' the extension will delete their customer object in Stripe which will immediately cancel all subscriptions for the user.

* Stripe API key with restricted access: What is your Stripe API key? We recommend creating a new [restricted key](https://stripe.com/docs/keys#limit-access) with write access only for the "Customers", "Checkout Sessions" and "Customer portal" resources. And read-only access for the "Subscriptions" and "Plans" resources.

* Stripe webhook secret: This is your signing secret for a Stripe-registered webhook. This webhook can only be registered after installation. Leave this value untouched during installation, then follow the postinstall instructions for registering your webhook and configuring this value.

* Firebase messaging sender ID

* Firebase API Key

* Firebase Messaging Key

* Firebase Cuttinboard Access Token

* Transactional Emails Api Api Key

* One Signal App Key

* Ose Signal User Auth Key

* One Signal App Id

* Storage Limit



**Cloud Functions:**

* **createCustomer:** Creates a Stripe customer object when a new user signs up.

* **createCheckoutSession:** Creates a Checkout session to collect the customer's payment details.

* **createPortalLink:** Creates links to the customer portal for the user to manage their payment & subscription details.

* **handleWebhookEvents:** Handles Stripe webhook events to keep subscription statuses in sync and update custom claims.

* **onUserDeleted:** Deletes the Stripe customer object and cancels all their subscriptions when the user is deleted in Firebase Authentication.

* **onCustomerDataDeleted:** Deletes the Stripe customer object and cancels all their subscriptions when the customer doc in Cloud Firestore is deleted.



**Access Required**:



This extension will operate with the following project IAM roles:

* firebaseauth.admin (Reason: Allows the extension to set custom claims for users.)

* datastore.user (Reason: Allows the extension to store customers & subscriptions in Cloud Firestore.)
