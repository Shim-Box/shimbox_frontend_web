// src/models/SignupData.ts
export class SignupData {
  email?: string;
  password?: string;
  name?: string;
  birth?: string;
  phoneNumber?: string;
  residence?: string;
  height?: number;
  weight?: number;
  licenseImage?: string;
  career?: string;
  averageWorking?: string;
  averageDelivery?: string;
  bloodPressure?: string;

  constructor(email?: string, password?: string, name?: string) {
    this.email = email;
    this.password = password;
    this.name = name;
  }

  toJSON(): Record<string, any> {
    return {
      email: this.email,
      password: this.password,
      name: this.name,
      birth: this.birth,
      phoneNumber: this.phoneNumber,
      residence: this.residence,
      height: this.height,
      weight: this.weight,
      licenseImage: this.licenseImage,
      career: this.career,
      averageWorking: this.averageWorking,
      averageDelivery: this.averageDelivery,
      bloodPressure: this.bloodPressure,
    };
  }

  static fromJSON(json: any): SignupData {
    const d = new SignupData();
    d.email = json.email;
    d.password = json.password;
    d.name = json.name;
    d.birth = json.birth;
    d.phoneNumber = json.phoneNumber;
    d.residence = json.residence;
    d.height = json.height;
    d.weight = json.weight;
    d.licenseImage = json.licenseImage;
    d.career = json.career;
    d.averageWorking = json.averageWorking;
    d.averageDelivery = json.averageDelivery;
    d.bloodPressure = json.bloodPressure;
    return d;
  }
}
