export default async function handler(req, res) {
  const { path = [] } = req.query
  const supabaseUrl = process.env.SUPABASE_URL

  const targetUrl = `${supabaseUrl}/${path.join('/')}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`

  const response = await fetch(targetUrl, {
    method: req.method,
    headers: {
      ...req.headers,
      host: undefined,
    },
    body: ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : req.body,
  })

  const buffer = await response.arrayBuffer()

  res.status(response.status)

  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  res.send(Buffer.from(buffer))
}
