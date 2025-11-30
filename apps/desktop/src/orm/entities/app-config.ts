import { BaseEntity, Column, Entity, PrimaryColumn } from "typeorm"

@Entity()
export class AppConfigEntity extends BaseEntity {
  @PrimaryColumn({ type: 'varchar'})
  key: string
  
  @Column({ type: 'varchar'})
  value: string
}
