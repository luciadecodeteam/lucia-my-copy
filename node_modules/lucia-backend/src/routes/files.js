const router = require('express').Router();
// TODO: Firebase auth middleware in prod

router.post('/presign', async (req, res) => {
  // Return a placeholder (replace with S3 presign later)
  const key = req.body?.key || `uploads/dev-${Date.now()}.bin`;
  return res.json({ url: 'https://example-presigned-url', key, method: 'PUT' });
});

module.exports = router;
