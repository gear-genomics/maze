import { axisLeft, axisTop } from 'd3-axis'
import { scaleLinear } from 'd3-scale'
import { select } from 'd3-selection'
import 'd3-transition'
import { zoom, zoomIdentity } from 'd3-zoom'
import kmers from 'k-mers'
import pako from 'pako'
import revcom from 'revcom'

const exampleButton = document.getElementById('btn-example')
exampleButton.addEventListener('click', loadExample)

const textareaReference = document.getElementById('textarea-reference')
const textareaQuery = document.getElementById('textarea-query')

const dropzoneReference = document.getElementById('dropzone-reference')
const dropzoneQuery = document.getElementById('dropzone-query')

setupSequenceDropzone(dropzoneReference, textareaReference)
setupSequenceDropzone(dropzoneQuery, textareaQuery)

const inputK = document.getElementById('input-k')

const revcomReferenceButton = document.getElementById('btn-revcom-reference')
const revcomQueryButton = document.getElementById('btn-revcom-query')

revcomReferenceButton.addEventListener(
  'click',
  revcomSeq.bind(null, textareaReference)
)

revcomQueryButton.addEventListener('click', revcomSeq.bind(null, textareaQuery))

const notification = document.getElementById('alert-global')
document
  .getElementById('alert-global__button-close')
  .addEventListener('click', () => {
    hideElement(notification)
  })

// Tab handling
const tabLinks = document.querySelectorAll('#mainTab .nav-link')
const tabPanes = document.querySelectorAll('.tab-pane')
tabLinks.forEach(link => {
  link.addEventListener('click', ev => {
    ev.preventDefault()
    activateTab(link.getAttribute('href'))
  })
})
function activateTab(targetId) {
  tabLinks.forEach(l =>
    l.classList.toggle('active', l.getAttribute('href') === targetId)
  )
  tabPanes.forEach(p =>
    p.classList.toggle('show', `#${p.id}` === targetId)
  )
  tabPanes.forEach(p =>
    p.classList.toggle('active', `#${p.id}` === targetId)
  )
}

// Plot elements
const chart = select('#chart')
const canvas = select('#canvas')
const context = canvas.node().getContext('2d')
const svg = select('#svg')

const resultInfo = document.getElementById('result-info')
const resultError = document.getElementById('result-error')
const errorMessage = document.getElementById('error-message')

const downloadPngButton = document.getElementById('btn-download-png')
const downloadSvgButton = document.getElementById('btn-download-svg')
downloadPngButton.addEventListener('click', downloadPNG)
downloadSvgButton.addEventListener('click', downloadSVG)

// Buttons
const submitButton = document.getElementById('btn-submit')
submitButton.addEventListener('click', () => {
  activateTab('#result-tab')
  showResultInfo()
  clearResultError()
  window.requestAnimationFrame(run)
})

const margin = {
  left: 75,
  right: 75,
  top: 75,
  bottom: 75
}

let currentTransform = zoomIdentity
let lastDimensions = null

function showResultInfo() {
  resultInfo.classList.remove('d-none')
}
function hideResultInfo() {
  resultInfo.classList.add('d-none')
}
function showResultError(message) {
  errorMessage.textContent = message
  resultError.classList.remove('d-none')
}
function clearResultError() {
  errorMessage.textContent = ''
  resultError.classList.add('d-none')
}

function run() {
  const reference = getSequence(textareaReference.value, 'Reference')
  const query = getSequence(textareaQuery.value, 'Query')
  const k = parseInt(inputK.value, 10)

  if (!reference.seq || !query.seq || !Number.isInteger(k) || k <= 0) {
    showResultError('Please provide both sequences and a positive integer for the match length.')
    hideResultInfo()
    return
  }

  if (!isDna(reference.seq) || !isDna(query.seq)) {
    showResultError(
      'Error: sequences must contain only the DNA alphabet {A, C, G, T}.'
    )
    hideResultInfo()
    return
  }

  visualize(k, reference.seq, query.seq)
  hideResultInfo()
}

function visualize(k, seq1, seq2) {
  const lenSeq1 = seq1.length
  const lenSeq2 = seq2.length

  const containerNode = chart.node()
  const containerRect = containerNode.getBoundingClientRect()
  const availableWidth = containerRect.width || 600
  const maxWidth = 900
  const width = Math.min(availableWidth, maxWidth)
  const maxHeight = Math.min(window.innerHeight * 0.7, 900)
  const height = Math.min(width, maxHeight)

  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  chart
    .style('width', `${width}px`)
    .style('max-width', '100%')
    .style('height', `${height}px`)
    .style('overflow', 'hidden')

  svg
    .attr('width', width)
    .attr('height', height)
    .style('width', `${width}px`)
    .style('height', `${height}px`)

  svg.selectAll('*').remove()

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`)

  canvas
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .style('width', `${innerWidth}px`)
    .style('height', `${innerHeight}px`)
    .style('transform', `translate(${margin.left}px, ${margin.top}px)`)

  const x = scaleLinear()
    .domain([0, lenSeq1 - 1])
    .range([0, innerWidth])

  const y = scaleLinear()
    .domain([0, lenSeq2 - 1])
    .range([0, innerHeight])

  const xAxis = axisTop(x)
  const yAxis = axisLeft(y)

  const gXaxis = g.append('g').call(xAxis)
  const gYaxis = g.append('g').call(yAxis)

  g.append('text')
    .attr('transform', `translate(${innerWidth / 2}, -40)`)
    .style('text-anchor', 'middle')
    .text('Sequence 1')

  g.append('text')
    .attr('transform', `translate(-60, ${innerHeight / 2}) rotate(-90)`)
    .style('text-anchor', 'middle')
    .text('Sequence 2')

  g.append('line')
    .style('stroke', 'black')
    .attr('x1', innerWidth)
    .attr('y1', 0)
    .attr('x2', innerWidth)
    .attr('y2', innerHeight)

  g.append('line')
    .style('stroke', 'black')
    .attr('x1', 0)
    .attr('y1', innerHeight)
    .attr('x2', innerWidth)
    .attr('y2', innerHeight)

  const zoomBehavior = zoom()
    .scaleExtent([1, Infinity])
    .translateExtent([[0, 0], [innerWidth, innerHeight]])
    .on('zoom', event => {
      draw(event.transform)
    })

  select('canvas').call(zoomBehavior)

  const index = buildIndex(k, seq1)

  select('canvas').call(zoomBehavior.transform, zoomIdentity)

  function draw(transform) {
    currentTransform = transform
    context.clearRect(0, 0, width, height)

    gXaxis.call(xAxis.scale(transform.rescaleX(x)))
    gYaxis.call(yAxis.scale(transform.rescaleY(y)))

    const iterKmers = kmers(k, seq2)
    context.beginPath()
    context.strokeStyle = 'dodgerblue'
    while (true) {
      const kmer = iterKmers.next()
      if (kmer.value === undefined) break
      if (kmer.value in index) {
        for (let hit of index[kmer.value]) {
          const [x1, y1] = transform.apply([x(hit), y(kmer.index)])
          const [x2, y2] = transform.apply([x(hit + k), y(kmer.index + k)])
          context.moveTo(x1, y1)
          context.lineTo(x2, y2)
        }
      }
    }
    context.stroke()

    iterKmers.seek(0)
    context.beginPath()
    context.strokeStyle = 'red'
    while (true) {
      const kmer = iterKmers.next()
      if (kmer.value === undefined) break
      const kmerRc = revcom(kmer.value)
      if (kmerRc in index) {
        for (let hit of index[kmerRc]) {
          const [x1, y1] = transform.apply([x(hit), y(kmer.index + k)])
          const [x2, y2] = transform.apply([x(hit + k), y(kmer.index)])
          context.moveTo(x1, y1)
          context.lineTo(x2, y2)
        }
      }
    }
    context.stroke()
  }

  lastDimensions = { width, height, innerWidth, innerHeight, margin }
}

function buildIndex(k, seq) {
  const index = {}
  const iterKmers = kmers(k, seq)
  while (true) {
    const kmer = iterKmers.next()
    if (kmer.value === undefined) break
    if (kmer.value in index) {
      index[kmer.value].push(kmer.index)
    } else {
      index[kmer.value] = [kmer.index]
    }
  }
  return index
}

function getSequence(str, id = '') {
  const ret = { header: '', id, seq: '' }
  if (str.startsWith('>')) {
    const headerEnd = str.indexOf('\n')
    ret.header = str.substring(0, headerEnd)
    const match = ret.header.match(/>\s*(\S+)/)
    if (match) ret.id = match[1]
    ret.seq = str.substring(headerEnd).replace(/\s+/g, '').toUpperCase()
  } else {
    ret.seq = str.replace(/\s+/g, '').toUpperCase()
  }
  return ret
}

function handleDragEnter(ev) {
  ev.stopPropagation()
  ev.preventDefault()
  ev.target.classList.add('dropzone--active')
}
function handleDragOver(ev) {
  ev.stopPropagation()
  ev.preventDefault()
}
function handleDragLeave(ev) {
  ev.stopPropagation()
  ev.preventDefault()
  ev.target.classList.remove('dropzone--active')
}

function getDroppedSequences(ev, cb) {
  const dt =
    ev.dataTransfer || (ev.originalEvent && ev.originalEvent.dataTransfer)
  const files = ev.target.files || (dt && dt.files)
  const f = files[0]
  readFasta(ev.target, f, cb)
}

function readFasta(node, f, cb) {
  const fReader = new FileReader()
  const isGzip = /\.gz$/.test(f.name)
  if (isGzip) {
    fReader.readAsArrayBuffer(f)
  } else {
    fReader.readAsText(f)
  }
  fReader.onload = function(ev) {
    let fContent = ev.target.result
    if (isGzip) {
      fContent = pako.ungzip(fContent, { to: 'string' })
    }
    cb(fContent)
  }
}

function setupSequenceDropzone(node, target) {
  node.addEventListener('dragenter', handleDragEnter)
  node.addEventListener('dragleave', handleDragLeave)
  node.addEventListener('dragover', handleDragOver)
  node.addEventListener('drop', ev => {
    ev.stopPropagation()
    ev.preventDefault()
    ev.target.classList.remove('dropzone--active')
    getDroppedSequences(ev, seq => {
      target.value = seq
    })
  })
}

function revcomSeq(textarea) {
  const seq = textarea.value
  if (seq === '') return
  if (isDna(seq)) {
    textarea.value = revcom(textarea.value)
  } else {
    showResultError('Error: only raw, DNA sequences can be reverse complemented')
  }
}

function showElement(element) {
  element.classList.remove('d-none')
}
function hideElement(element) {
  element.classList.add('d-none')
}
function isDna(seq) {
  const dnaPat = /^[ACGT\n]+$/i
  return dnaPat.test(seq)
}
function showError(message) {
  showElement(document.getElementById('alert-global'))
  document.getElementById('alert-global__message').textContent = message
}

const exampleSeq1 =
  'CAGCACTTTGGGAGGCTAAGGCGGGTGGATCACCTGAGGTCAGGAGTTCAAGACCAACCTTACCAACATGGTGAGACTCTGTCTCTACTAAAAATACAAAAAATGAGCCGGGCGTGGTGGCGCATGTCTGTAGTCTCAGCTACTCAGGAGGCTGAGACAGGAGAATCAGTTGAACCCGGGAGGCAGAGGTTGCAGCGAGCCAAGATTGCACCACTGCACTCCAGCCTGGGTGACAGAGCAAGACTCTGTCCCCCCCCAAAAAAAAGGGGGAGAGAGAGAGAAAGAGAGGAGATTCCCAGACACACTACCCTTTTAAATGGTAAATGGAAAATATTAAAACTATTATTGATTTGACTCATTCGAGGCTTAACCTGTCATAAATGTATCTTCTTAATTTCTCTCCTTCAAAACTGCTTCAGAACTTTGTATGAAGCGAGAAAGTAATTACAAATATCTTAGATTTTTCTTATTGCATGGTGACAGAATAATCAATCAAAATCTGCAAAATGGAGACATTTTTCAATCTTTAAGGAAGATGTTAAAAACTAAACAAACACAGAAGAACTATGTCCAACTCTTTAAAATGAACAATGAATTCTAATTACCTCTTCTTGAAACACAATTATGGCTTCCTGGAATTGTTTTTCACTTTCCCCTGTGGCGCTCAAAAGCTTTGTGTTTTCATAGAGAGTTTCATTCACAATGCGATCAGACTGAAAATTGAAAAGTATTTTACATTATTCACGCCACAAGGTAGTATTTCAATTTTTCAAACTTCTTCAAAATTTTCAAACATCTGTGCACACACCTTAGATTTGAAAACAGCTCCTAGGATACCTGTCGCCACCTGCAGGAGCAGGATCAGAAGCAAGCCTATGAAAAACTGAAGAAGAGAAAAAGAAATATACATTATCCTCAGTGCATTCAGTAACATCTGGGGACATTCTGGCACAGCACTTCTCTCTACAGCTGGGATTATATCACAGTGAGAGTGTCAGTCACACTCTTCATTTATTCCACTTTTTACTTCAAGCTGAAAATTTTGGGTTCATTACTACTCAGAAAATTGCTCCAGAGACTGATCGAGGAAAGTGGTTCAGGCAAAAAAATTATCAAAACAACCATTGATATCTGTATGATATTGACTAGAGGGAAGTTTGAAAACTTAGATGAGTTTATTTGAGTATTATTTTACTCCTTCCCTTTCTTCATCAAACACAACCTCACACAAACTCAGAATTGGCTTTGAAACAGCATCTCCACTACATTCAGAATCACCTGGCATCTTGTTACATATATAGATTCCTGAAATCGGCTTCAGATATGCTGAATCATAAGTTTGAAGGATGCAGCCCAAAGACAATTAGCTTTTTTTTTAAACAAGCTCCTTGAGTAATTAAATTCTTCAATTGCAAATGAGGCCTTATTGTTCAAAAAGCAATCAGTAGGAATGTTATTAGAGTCCCTTTAAAACTCTGTCTCTACCGTCCCTCACAATAAACAAACAGTTTTGAACATTTTTCTCAGGTACTGATATAATCCTTACTTTATTAGAGGAATAAGTTTAGATTAGACCTGATAAACTTTTATGTCATATTTGTATCTGATAAACACTTGATTTTTTTCTAATATTTTTACTATATCCATTTTCTACTGTATATGTTAAAAGTGAATGCCTGTGAATTATCCAAACCCAATTTATCCTCCTCAATGCTCTCTAAGAGATAATTCTGATTATCTCATTCATTTAAACTTTTTTTTTAGCATGGCATGTAGAACACCTATGATTTTACCACAACCCACACTTGGATTCATCTTCCATCATTTACTGGAAACAGTTTTGCCGGTCTCCTGCCATACCCAAGGCTTCTCAGTTCCCAAACACACCAGCACTGTACTGCCACGTTGTCTTTCCGGAAAGCTTTTCCTACCCTCACTCATACAAATACCTTATTCACTTCTGCCCTGGTTTGAAAATCCCATCCCCTGTCTTGCCCTTTGCTTCTGGGGCCACTCCCACTGTAGCTATTTGCTTACTTATTAACCTTCCCTAGTAGGTTCTAAAGGTCTTATGTATTATTTCGCACAATATCTGACACATAGAGGTATGGCAGTAATGTTGAATGAGTGAATGAATGAATGGATGAATGATTAAAATTTGTCTCCTCTCAGAGTATCCTCCAGTTTCTAAGCCAAACTAAGCCAAATCTAAGCCATATCAGCTTCCACAATCAAACCTTCTAAAGAGAAGTTGGAGTTAGAGTTTCATCAATCATGGCACGTTCTTTTAACAGACAATAGGGATGGGAGAGAATCCTCTGGAGTCTGAAGGTTGGACACTGGGATTTGTTTGGAGAACTCACCAACAGAAGCATGCAGCGACTTTCTTTTATAGCACCGCAGCATCCCAGGAAGCCCAGAATCATGATGATGGCACCTACAGCAATCAATATGTCCACAGCAACGTAGGAGCTAGAGCCTACATCTTCAGAACCAAAAATCTGAAGTAAAAAAGAGATTAATGGCAGAAAATTTATTTCCTTGAAGTTTATTTTGCTCATTCAACAAATATCCATTGAGTGCCTCCTATGTGTCAAGTCCTGTGCCAGGACCCTGAAATACATCAGTGATCTTAAAAAGTACAAATCCTTGCCCTCATGGAGCTCACATTCTATTGAAGTGCTTATATTTTTCTAAAATGATATGATGAAAGCTGGGTGGAAGAAATGTAATAGGTTTTTTTAAACCGTATTTTTAAAAGCTTAGGACAGTTACTTTTACTCTTCTTGATGTAATCTTTGGTTCACATATTTTGTGTATTCTATATAAAGTGCATTATAAAAGCATGTGTTGTTATGGTTTTTAATTCTTTAAAAAGTTCAAGCTCTTTAAACTATTGATAGACACAACAATATGAATTAATTTCAGAGTCATTATGCTGAGCTAAAGAAGCCATAGAAAAAAGTAAATACTGTATGATTCCATTTCTATAAAGTTCAATCATAAGCAAAACTATGGTTATAAAAATCAAAGCAGTGCTTGACTTTGAGCAAGGCAGAAGGGAAAGCAAGAGTTAACTGAAAAGGGACATGAGGGAACTTCCATGGGTTAATAAAAATGCTTTGTATCCTCATTAAAAAGAAATCCAGTTCCTGATATTTCATATCTATTTTATCTCTTTGTTCCCAAAAGCCATAGTCCATAGAGTCATCTAGAAACTCTATTTTGACTGTTAGTTAATGAGATATGAAGGGAAAAAAAATCCTAGAGCCCTTTATAGTGGGTGGGCTACCCATCAGGCATAATTCAGTTCTCCCAACAACACACACATACTCGTCTTCATCACCCTCATAACACTTAGCCTCAGCCACCTCTTGTCCTCGATAAGTGGATTTATCCAGAAGTAAATCACAATTAAAAAGTAAAGCCTTGTGCGTGTCTTATGCATAAATCCTATATGTAGCCCATTTGCCTTCTATAACCTCTATCTACTGGGCTGTCTCTAGATAGAGCACTAGTTCCTAGACTAACTCGAAACCTCTGCCTCCCAGAATGGGCTATATAGCATGTAGGTCAGCTCCCTTAACAGTCAATACAAAAATGAC'
const exampleSeq2 =
  'AGCACTTTGGGAAGGCTAAGGCGGGGTTGATCACCTGAAGGTCAGGAGTTCCAAGACGCAACCTTAACCACATGGTGAAGACTCCTGTCTCTACTAAAAAAATACAAAAATGAAGCCGGGCGGTGGTTGGCGCATGTTCTTGTAAGTCTCAGCTAACTGCAGGAAGGCTTTGAGACGGAGAATCAGTTGAACCCGGGAGGCAGAAGGTTGCAAGCGAGCCAAGATTTTGGGCGCCACTGCACTACCAGCCTGGGTGGACAGAAGCAGACTTCCTGTCCCCCCCCAAAAAAAAGGGGGGAGAGAGGAGAGAAAAAGAGAGGAGAATTGCGCAGACAACACTACGTTTTTAAATGGTAAAATGGAAAATTGAATTAAAACTATTATTCGGATGAGCTCATTCGAGGCTTAACCTTGTTCATAAATGTATCTTCTTAATTTTTCTCTCCTTCAAAACTGCTGTCAGAACTTTGTTTATGAAAGCGAGAAAAGTAATGTTACAAAATATCTTTAGATTTTTCTTATTGCAGTGGGAAACCAGAAATATCAATCAAAATCGCAAAATGGAGAACATTTTTCATCTTTAAGGAAGATGTTAAAAACTAAACAAACACAGAAGAAACTTAATGCAAACTTCTTTTAAAAATGAACAATGATTCTAAATTACCGTCTTCTTGAAACACAATTTATGGCTTTTCCTGGAATTGTTTTTTTTCACTTTCCCCTGTGGCGCTGCAAAGCTTTGTGTTTTCCCATTAGAGGAGTTTTTTCATTCACAATGCGATGCAAGACTGAAAATTGAAAAGTATTTTACATTATTTTACGCCACAAAAGGTAGTATTCAATTTTTTTCAAACTTCTTCCAAAAATTTTTGCAAAAACATCCCTTTGTGGCAAACACACCTTAAGATTTTTGAAAAACAGTCTCCTAGGAAACCTTGTTCGCCAACCTGCAGGAAGCAGGATCAAGAAAGCAAGCCTATGAAAAAACTGAAGAAGGAGAAAAGAAATTACATTATCCTCAAAGTGGCATTGAAGTACATCTTGGGGAATTTCTGGCAAACAGCACTTCTCTTAACAGCTTGGATTATATCACAGTTTGAGAGGCAGTCACACCTTTTTCAATTTATTTCCACTTTTTTTAAAAACTTCCAAGCTGAAAAATTTTGGGTTCATTTATATCAGAAAAATTTGCTGCCAGAGAACTGGAGTTCCGAGGAAAGTTGGTTTATTCAGGCCAAAAAAAATTATGCAAAAACAACCATTTGATAATTCTGTATGAATAATTGACTTGAGGGAAAAGTTTGAAATTAGAAAATGAGTTTTATTTGAGTATTATTTTTAGCTCCTTGTCCCTTTCTTCAATCAAAACACACCTCAACAAACAAACTCCAGAATTGGCTTTGAAAACGCATCTCCACTACATTCAGAATCACCTGGCAAATCTGTTTACAATATAATGATTTCCCTGAAAATCGGGCTTCAAAGATATGCTGAATCCATAAGTTTTTGAAGGAATGCAAGCCCAAAGGACATTAGCTTTTTTTTTTTTTTAACAAGCTTCCTTTGAGTAATTAAAATTTCTTCAATTGGGCAAAATGAAGGCCTTATTGTTTTTCAAAAAAGCAATCAAAGTAGGAATGTTATTGAGTCCCTTTTAAAACTCTGTCCCTCCTTACCGTCCTTCACAATAAACAAACAGTTTTTGAACATTTTTTCTCCAGGTACGTGATAATAAATCCTTAACTTTATTAGAGGAATAAGTTTTTAGATTAGAACCTTGATTAAACTTTTATGTCATAATTTGTATTCTGGAATTAAACACTGATTTTTTTCCTTTAAATATTTTTACTTATATCCATTTTTCTAACTGTTATTGTTAAAAAGTGGAATGCCTGTGAATTATCCAAACCCGCAATTTTATCTCCCTCCAATTGGCTTCTTCTTTAAGAAGATTATTTCATGAATTATCTCAATTCATTTAAACTTTTTTTTAGCATGGCGCAATGTAGAACACCTTATGATTTACACACCCACACTTGGAATTCCATCTTCCATCATTTACTGGAAAACAGTTTTGCCGTCCTGCCCCTTGGCCATAACCCAAGGCTTCTCAGTTCCCAACACACCAGCCACTGTTACTGCACGATTGTCTTGTTCCGGAAAAGCTTTTCCTACCCCCTCCTCAATACAAATACCTTATTCCACTTCTGCCCTTGGTTATGAAAAATCCCAATCCCCCCTTAGTGGTCTTTTGCCCTTTTTGGCTTCTGGGGGCCACTTTCCACTGTAGCTATTTGCTTACTTATTAAAACCTTCCCTAGTAGGTTCTAAAAGGTCTTATGTATTAATTTCGCACAATATCTGAAACACATAGAAGGGTATGGCAAAGTTAAATGTTGAATGAAGTGAAGAATGAATGGATGAAATGGATTAAAATTTGTTCTCCTCTTTCAGAGTATCCTCAGTTTCCTTAAAAGCCAAAACTAAGCCAAATCTAAGCCATAAGTCAGCTTCCCCACAATCAAACCTTCTAAAAGAGAAAAGTTGGAAGTTAGAGTTTTTTCAATCAATCAATGGCACGTTTCTTTTTAACAGACAATTAGGGATGGGAAGAAAGAATCATTCTGGAAAAAGTCTGAAGGTTGGGAAACCACTGGGGAAATTTTGTTTTTGGAGAACTTTCAAAACCAACAGAAGCCAATTGCAGCCGACTTTTCTTTATAGCAACCGGCAGCGCATGCCCAGGAAGCCCAAGAAATCATGAATGATTGGCAACCTAACAGCAAATTCAATATGTTCCCACAGCCAACGTAGGAGCTAGAAGCCCCTTACAATCTTCAAGAAACCAAAAATCTGAAGTAAAAAAAAAAGATTTTAAATGGCAAGAAAATTTATTTCCTTGAAAAGTTTATTTTTTGCTCATTCAACAAATATCCATTGAAGTTTGCCTCCTATGTGTCAAGTCCTGTGCCCAGGACCCTGAAATTCATCCTTCATTTCATTTCAATCATTCATTTTTCATACATTCAAACCATTACTAGCCATACTTCTATGTGGTCCGATTATTTGTGGCGAAATTAATACATAAGACCTTTTAGAAAACCCTACTTAGGGAAGGTAATAAAGTAGCAAATAGCTTTTACAGTGGGGAGTGGCCCCAAGAAGGCAAAGGGCAAGACAGGGGAAATGGGAATTTTCAAAACCAGGGCCAGAAAGTGAAATTAAGGGTATTTTGTATGAGGTGAGGGTAGGAAAAAAGCTTTCCGGAAAGAACAAACGTTGGCAGTAACAGTGGGCTGGTGTGTTTTGGGAACTGGAGAAGCCTTTGGGTTATGGCAAGGAGACCGCAAAACTGGGTTTCCAGTAAAAATGATTGGAAAGATTGAATTCCAAGTGTGGGTTTGGGGTAAAAATTCATGGTGTTCTAACATGCCATGCTAAAAAAAAAGTTATTTAAATGAAATGAAGATTCAATCCAGAAATTATCTCTTAGAGAGGCATTGAGGAGGAATAAATTGGGTTTTGGATAATTCGACAAGGCATTTCACTTAAAAAGGTTACAAATTTGAATCTTAAAAAGTCACAAAATCCTTTGCCCTCATGGAGCCTCACAATTCTATTGAATTTGCTTAATTATTTTTCTAAATGAAAATAATGAAAAAAAAAAAATGAAGCTGGGGTTGGAAGAAATGTAAAAATGGTTTTTTTTTTTTTTAAATGTAATTTTTTTAAAAAACTTAGGAACAGTTTATTTTACTTCTTGCTTGATGTAAATTCTTTGGTTCAACAATTTTGTGTATCTATATACAAGTGCAATTAATAAAAGCCTGTGTTGTTATGGTTTTAATTCTTTAAAAAAGTTTTCAAAGGCTCTTTAAACTATGATAGACAACACAATATGAATTAAATTTTTCAGAGCATTATGCTGAAAGCTAAAGAAGCCATAGAAAAAAGTAAATAATGTATTGATCCCAATTTTCTATAAAAGTTCAATCATAAGCAAAACTATGGGGTTTTTATAAAAAAATCAAAGCAATGGCTTGACTTTTGAGCAAGGCAGAAGGGAAAAGCAAGAAAGTTAACTGAAAAAGGGACATGAGGGAAAAACTTCCATGGGGTTTTTAATAAAAATGCCTTTGTATCCTCAATTAAAAAAGAAATCCAGTTTCCTGGAATATTTTTCAATAATCTATTTTTATCTCTTTGTTTTGCCCAAAAGCCAATAGTCCATGAGAGTCATCTTAGGAAAACCTCTATTTTTTGACTGTGTAGTATAATGAGAATAATGAAAGGGAAAAAAAAATCCTAGAAGCCCTTTATTAGTGGGGGTGGGCTTACCCCATTTCAAGGCAATGAATTAAGTTCTCCCAACAACACAACATATCGTCTTCAATCACCTCATAACAACTTACCTCAGCCACCTCTTTTGTCCTGATAAGTGGGATTTATCCAGAAGTAAAATCAAATTAAAAAGTAAAAGCTTTGTGCGTGTCTTAAGCAAATCAAAATTCCTATATGTAGCCCCATTTCCTTCTTATAACCTCTATCTATGGGGCTGTCTCTAGATACGAGCACTTAGTTTTCCCTAGACTAACTCGAAAAAACTCTTGCCTCCCAGAATGGGCCTTTATAATACGCATGTAAGTCAGCTTTCCCCTTAACAGTCAATACAAAAATGAC'

function loadExample() {
  textareaReference.value = exampleSeq1
  textareaQuery.value = exampleSeq2
  inputK.value = '8'
}

// Downloads
function downloadPNG() {
  if (!lastDimensions) {
    showResultError('No plot available to download yet.')
    return
  }
  const { width, height, margin, innerWidth, innerHeight } = lastDimensions
  const svgNode = svg.node()
  const canvasNode = canvas.node()

  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = width
  exportCanvas.height = height
  const ctx = exportCanvas.getContext('2d')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const svgData = new XMLSerializer().serializeToString(svgNode)
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0)
    ctx.drawImage(canvasNode, margin.left, margin.top, innerWidth, innerHeight)
    URL.revokeObjectURL(url)
    const link = document.createElement('a')
    link.download = 'maze-dotplot.png'
    link.href = exportCanvas.toDataURL('image/png')
    link.click()
  }
  img.onerror = () => {
    showResultError('Failed to generate PNG download.')
    URL.revokeObjectURL(url)
  }
  img.src = url
}

function downloadSVG() {
  if (!lastDimensions) {
    showResultError('No plot available to download yet.')
    return
  }
  const { width, height, margin, innerWidth, innerHeight } = lastDimensions
  const canvasNode = canvas.node()
  const canvasData = canvasNode.toDataURL('image/png')

  const svgContent = svg.node().innerHTML
  const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">
  <image x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${innerHeight}" xlink:href="${canvasData}" />
  ${svgContent}
</svg>`.trim()

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = 'maze-dotplot.svg'
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}
