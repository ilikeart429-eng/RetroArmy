
const c=document.getElementById('game'),x=c.getContext('2d');
const W=10,H=20,S=20;
const board=Array.from({length:H},()=>Array(W).fill(0));
const pcs=[[[1,1,1,1]],[[2,2],[2,2]],[[0,3,0],[3,3,3]],[[4,4,0],[0,4,4]],[[0,5,5],[5,5,0]],[[6,0,0],[6,6,6]],[[0,0,7],[7,7,7]]];
const col=["#000","#0ff","#ff0","#f0f","#0f0","#f00","#00f","#fa0"];
let p=newPiece(),score=0;
function newPiece(){let s=pcs[Math.random()*pcs.length|0].map(r=>r.slice());return{x:3,y:0,s};}
function draw(){
x.clearRect(0,0,c.width,c.height);
for(let y=0;y<H;y++)for(let i=0;i<W;i++){x.fillStyle=col[board[y][i]]||"#222";x.fillRect(i*S,y*S,S-1,S-1);}
for(let y=0;y<p.s.length;y++)for(let i=0;i<p.s[y].length;i++)if(p.s[y][i]){x.fillStyle=col[p.s[y][i]];x.fillRect((p.x+i)*S,(p.y+y)*S,S-1,S-1);}
document.getElementById("score").textContent=score;
}
function hit(nx=p.x,ny=p.y,sh=p.s){
for(let y=0;y<sh.length;y++)for(let i=0;i<sh[y].length;i++)if(sh[y][i]){
let X=nx+i,Y=ny+y;
if(X<0||X>=W||Y>=H)return true;
if(Y>=0&&board[Y][X])return true;
}
return false;
}
function merge(){for(let y=0;y<p.s.length;y++)for(let i=0;i<p.s[y].length;i++)if(p.s[y][i])board[p.y+y][p.x+i]=p.s[y][i];
for(let y=H-1;y>=0;y--)if(board[y].every(v=>v)){board.splice(y,1);board.unshift(Array(W).fill(0));score+=100;y++;}
p=newPiece();if(hit()){alert("Game Over");board.forEach(r=>r.fill(0));score=0;}
}
function rot(){let s=p.s,r=s[0].map((_,i)=>s.map(r=>r[i]).reverse());if(!hit(p.x,p.y,r))p.s=r;}
document.addEventListener("keydown",e=>{
if(e.key=="ArrowLeft"&&!hit(p.x-1,p.y))p.x--;
if(e.key=="ArrowRight"&&!hit(p.x+1,p.y))p.x++;
if(e.key=="ArrowDown"){tick();}
if(e.key=="ArrowUp")rot();
draw();
});
function tick(){if(!hit(p.x,p.y+1))p.y++;else merge();draw();}
setInterval(tick,500);draw();
