export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL

  const path = req.url.replace('/api/supabase', '')

  const response = await fetch(`${supabaseUrl}${path}`, {
    method: req.method,
    headers: {
      ...req.headers,
      host: undefined,
    },
    body: ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : req.body,
  })

  const data = await response.arrayBuffer()

  res.status(response.status)

  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  res.send(Buffer.from(data))
}
