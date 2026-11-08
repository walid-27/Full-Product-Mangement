
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LOGIN_PATH = __ENV.LOGIN_PATH || '/auth/login';
const PRODUCT_PATH = __ENV.PRODUCT_PATH || '/api/product';

const EMAIL = __ENV.TEST_EMAIL || 'walid19@gmail.com';
const PASSWORD = __ENV.TEST_PASSWORD || '123456';

// Must run in init stage
const productImage = open('./fixtures/product.jpg', 'b');


export const options = {
  stages: [
    { duration: "10s", target: 10 },
    { duration: "10s", target: 20 },
    { duration: "10s", target: 30 },
    { duration: "30s", target: 30 },
    { duration: "10s", target: 0 },
  ],

  thresholds: {
    checks: ["rate>0.95"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};


function parseJson(response) {
  try {
    return response.json();
  } catch (error) {
    console.error(`Invalid JSON response: ${response.body}`);
    return {};
  }
}

function getToken(data) {
  return (
    data?.token ||
    data?.accessToken ||
    data?.access_token ||
    data?.register?.token ||
    data?.data?.token ||
    data?.data?.accessToken
  );
}

// Receives parsed JSON data, NOT an HTTP response
function getProductId(data) {
  return (
    data?.product?.Product?._id ||
    data?.product?.product?._id ||
    data?.product?. _id ||
    data?.Product?._id ||
    data?.product?._id ||
    data?._id ||
    null
  );
}

export default function () {
  // 1. Login
  const login = http.post(
    `${BASE_URL}${LOGIN_PATH}`,
    JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'login' },
    }
  );

  const loginData = parseJson(login);
  const token = getToken(loginData);

  const loginOK = check(login, {
    'login returns success': (r) => r.status === 200,
    'login returns a JWT': () => Boolean(token),
  });

  if (!loginOK || !token) {
    console.error(`Login failed: status=${login.status}, body=${login.body}`);
    return;
  }

  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  // 2. List products
  const list = http.get(`${BASE_URL}/api/product`, {
  headers,
  tags: { endpoint: "list_products" },
});

  check(list, {
    'list products returns 200': (r) => r.status === 200,
  });

  // 3. Create product with image
  const unique = `${exec.vu.idInTest}-${__ITER}-${Date.now()}`;

  const create = http.post(
    `${BASE_URL}${PRODUCT_PATH}`,
    {
      name: `k6-test-${unique}`,
      price: '100',
      category: 'k6-test',
      image: http.file(productImage, 'product.jpg', 'image/jpeg'),
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      tags: { endpoint: 'create-product' },
    }
  );

  const createOK = check(create, {
    'create product returns 200 or 201': (r) =>
      r.status === 200 || r.status === 201,
  });

  if (!createOK) {
    console.error(
      `CREATE FAILED: status=${create.status}, body=${create.body}`
    );
    return;
  }

  const createData = parseJson(create);
  const productId = getProductId(createData);

  if (!productId) {
    console.error(
      `Product ID not found. Parsed response: ${JSON.stringify(createData)}`
    );
    return;
  }

  const productURL = `${BASE_URL}${PRODUCT_PATH}/${productId}`;

 
  // 5. Update product
  const update = http.patch(
    productURL,
    JSON.stringify({ price: 120 }),
    {
      ...params,
      tags: { endpoint: 'update-product' },
    }
  );

  check(update, {
    'update product returns success': (r) =>
      r.status === 200 || r.status === 204,
  });

  // 6. Delete only this iteration's product
  const remove = http.del(productURL, null, {
    ...params,
    tags: { endpoint: 'delete-product' },
  });

  check(remove, {
    'delete product returns success': (r) =>
      r.status === 200 || r.status === 204,
  });

  sleep(1);
}
