import axiosInstance from "./axios";

export async function getProfile() {
  const res = await axiosInstance.get("/users/profile");
  return res.data;
}

export async function updateProfile(data) {
  const res = await axiosInstance.put("/users/profile", data);
  return res.data;
}
