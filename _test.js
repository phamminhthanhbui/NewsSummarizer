const extractImage = (block) => {
  const enc = block.match(/<enclosure[^>]+url="([^"]+)"/i);
  if (enc) return enc[1];
  const cdata = block.match(/<!\[CDATA\[(.*?)\]\]/s);
  if (cdata) {
    const img = cdata[1].match(/<img[^>]+src="([^"]+)"/i);
    if (img) return img[1];
  }
  const img = block.match(/<img[^>]+src="([^"]+)"/i);
  return img ? img[1] : undefined;
};

// VNExpress real enclosure
const vnx = '<item><enclosure type="image/jpeg" length="1200" url="https://vcdn1-vnexpress.vnecdn.net/2026/08/07/JDAMLR-1786075290-7538-1786075780.png?w=1200&amp;h=0&amp;q=100&amp;dpr=1&amp;fit=crop&amp;s=DsY2YPxWYYYUKz7p1Qsw0w"/><description><![CDATA[<a href="x"><img src="https://cdn1.jpg"></a>]]></description></item>';
console.log('VNX:', extractImage(vnBlock));

// Tuoi Tre real
const ttBlock = '<item><enclosure url="https://cdn2.tuoitre.vn/thumb_w/1200/471584752817336020/2026/8/7/abc.jpg" length="0" type="image/jpeg" /></item>';
console.log('TT:', extract(ttBlock));