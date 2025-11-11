import axios from 'axios';
import CryptoJS from 'crypto-js';

// Create API client
export const apiClient = axios.create({
  // baseURL: 'https://server.matka369.in/api',
  baseURL:'http://localhost:8080/api',
  headers: { 'Content-Type': 'application/json' },
}); 
          
const encryptPassword = (password: string): string => {
  const key = CryptoJS.enc.Hex.parse('db0dd030b6df54ff8f41dbfcf77f946994e727015f86c1a9d10c93968964fd73'); 
  const iv = CryptoJS.enc.Hex.parse('d5b59bbf1c76badbc5ef87a43b50176f'); 
 const encrypted = CryptoJS.AES.encrypt(password, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC, 
    padding: CryptoJS.pad.Pkcs7,
  });  
  return encrypted.toString();
};
// Login API call
export const loginUser = async (userid: string, password: string) => {
  try {
    const encryptedPassword = encryptPassword(password);
    
    const response = await apiClient.post('/login', {
      userid,
      pwd: encryptedPassword,
    });

    return response.data; // { role, id }

  } catch  {
    return  { message: 'Login failed' };
  }
};
